// Package cibuild resolves a released ClickHouse version and build type into the set of
// .deb package URLs needed to build a matching Docker image locally.
//
// Release builds are served from Docker Hub and are not handled here. For debug and
// sanitizer builds, the resolver maps the version to its commit sha and reads the
// per-commit ReleaseBranchCI report to find the produced package URLs.
package cibuild

import (
	"context"
	"path"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/lodthe/clickhouse-playground/internal/buildtype"
	"github.com/lodthe/clickhouse-playground/pkg/clickhousebuilds"

	"github.com/pkg/errors"
	"github.com/rs/zerolog"
)

// fullVersionRe matches a fully qualified release version like "26.3.14.45".
var fullVersionRe = regexp.MustCompile(`^\d+\.\d+\.\d+\.\d+$`)

// maxCandidateCommits bounds how many recent release-branch commits are probed when a version
// does not map to an exact tagged commit (e.g. a "major.minor" ref like "26.2").
const maxCandidateCommits = 5

// BuildSpec describes how to build a ClickHouse image for a non-release build type.
type BuildSpec struct {
	// Version is the ClickHouse version, passed as the VERSION Docker build arg.
	Version string
	// DownloadURLs are the .deb package URLs passed as DIRECT_DOWNLOAD_URLS.
	DownloadURLs []string
}

// Resolver maps a (version, build type) pair to a BuildSpec.
type Resolver interface {
	Resolve(ctx context.Context, version string, bt buildtype.BuildType) (BuildSpec, error)
}

// buildsClient is the subset of clickhousebuilds.Client the resolver depends on.
type buildsClient interface {
	ResolveCommitSHA(ctx context.Context, ref string) (string, error)
	GetRecentCommitSHAs(ctx context.Context, ref string, limit int) ([]string, error)
	GetReleaseBranchReport(ctx context.Context, ref, sha string) (*clickhousebuilds.Report, error)
}

// requiredPackagePrefixes lists the .deb packages the official Dockerfile.ubuntu installs
// (PACKAGES="clickhouse-client clickhouse-server clickhouse-common-static"). The trailing
// underscore is significant: it separates the package name from the version and prevents
// matching "clickhouse-common-static-dbg" or "clickhouse-keeper".
var requiredPackagePrefixes = []string{
	"clickhouse-common-static_",
	"clickhouse-server_",
	"clickhouse-client_",
}

type cacheEntry struct {
	spec      BuildSpec
	expiresAt time.Time
}

type resolver struct {
	cli    buildsClient
	logger zerolog.Logger
	ttl    time.Duration

	mu    sync.Mutex
	cache map[string]cacheEntry
}

// NewResolver creates a Resolver backed by the given client.
func NewResolver(logger zerolog.Logger, cli buildsClient, cfg Config) Resolver {
	ttl := cfg.CacheTTL
	if ttl <= 0 {
		ttl = DefaultCacheTTL
	}

	return &resolver{
		cli:    cli,
		logger: logger,
		ttl:    ttl,
		cache:  make(map[string]cacheEntry),
	}
}

func (r *resolver) Resolve(ctx context.Context, version string, bt buildtype.BuildType) (BuildSpec, error) {
	if bt.IsRelease() {
		return BuildSpec{}, errors.New("release builds are served from Docker Hub, not built locally")
	}

	key := version + "/" + bt.String()
	if spec, ok := r.cached(key); ok {
		return spec, nil
	}

	ref, err := releaseBranchRef(version)
	if err != nil {
		return BuildSpec{}, err
	}

	shas, err := r.candidateSHAs(ctx, version, ref)
	if err != nil {
		return BuildSpec{}, err
	}

	// Probe candidate commits newest-first until one has a successful build for the variant.
	var lastErr error
	for _, sha := range shas {
		report, err := r.cli.GetReleaseBranchReport(ctx, ref, sha)
		if err != nil {
			lastErr = err
			continue
		}

		job, found := report.AMDBuildJob(bt.String())
		if !found {
			lastErr = errors.Errorf("no successful amd64 %s build at %s@%s", bt, ref, sha)
			continue
		}

		urls, err := selectPackageURLs(job.Links)
		if err != nil {
			lastErr = errors.Wrapf(err, "%s build artifacts at %s", bt, sha)
			continue
		}

		spec := BuildSpec{Version: version, DownloadURLs: urls}
		r.store(key, spec)

		r.logger.Info().
			Str("version", version).
			Str("build_type", bt.String()).
			Str("ref", ref).
			Str("sha", sha).
			Int("packages", len(urls)).
			Msg("resolved CI build artifacts")

		return spec, nil
	}

	if lastErr == nil {
		lastErr = errors.Errorf("no commits found for %s", ref)
	}

	return BuildSpec{}, errors.Wrapf(lastErr, "no %s build available for %s", bt, version)
}

// candidateSHAs returns the commit shas to probe for a version, newest-first. A fully
// qualified version is mapped to its "-stable" tag commit; short refs (and tag-resolution
// failures) fall back to the most recent commits on the release branch.
func (r *resolver) candidateSHAs(ctx context.Context, version, ref string) ([]string, error) {
	var shas []string

	if fullVersionRe.MatchString(version) {
		tag := "v" + version + "-stable"
		sha, err := r.cli.ResolveCommitSHA(ctx, tag)
		if err == nil {
			shas = append(shas, sha)
		} else {
			r.logger.Debug().Err(err).Str("tag", tag).Msg("tag resolution failed; falling back to recent branch commits")
		}
	}

	recent, err := r.cli.GetRecentCommitSHAs(ctx, ref, maxCandidateCommits)
	if err != nil {
		if len(shas) > 0 {
			// We still have the tagged commit to try.
			return shas, nil
		}
		return nil, errors.Wrapf(err, "failed to list commits for %s", ref)
	}

	// Append recent commits, skipping the tagged sha if already present.
	for _, sha := range recent {
		if len(shas) == 0 || shas[0] != sha {
			shas = append(shas, sha)
		}
	}

	if len(shas) == 0 {
		return nil, errors.Errorf("no commits found for release branch %s", ref)
	}

	return shas, nil
}

func (r *resolver) cached(key string) (BuildSpec, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	entry, ok := r.cache[key]
	if !ok || time.Now().After(entry.expiresAt) {
		return BuildSpec{}, false
	}

	return entry.spec, true
}

func (r *resolver) store(key string, spec BuildSpec) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.cache[key] = cacheEntry{spec: spec, expiresAt: time.Now().Add(r.ttl)}
}

// releaseBranchRef extracts the "<major>.<minor>" release-branch ref from a version.
func releaseBranchRef(version string) (string, error) {
	parts := strings.Split(version, ".")
	if len(parts) < 2 || parts[0] == "" || parts[1] == "" {
		return "", errors.Errorf("version %q is not a fully qualified release version", version)
	}

	return parts[0] + "." + parts[1], nil
}

// selectPackageURLs picks exactly one URL for each required package from the build job's links.
func selectPackageURLs(links []string) ([]string, error) {
	urls := make([]string, 0, len(requiredPackagePrefixes))

	for _, prefix := range requiredPackagePrefixes {
		var matched string
		for _, link := range links {
			base := path.Base(link)
			if strings.HasPrefix(base, prefix) && strings.HasSuffix(base, ".deb") {
				matched = link
				break
			}
		}
		if matched == "" {
			return nil, errors.Errorf("missing package %s*.deb", prefix)
		}

		urls = append(urls, matched)
	}

	return urls, nil
}
