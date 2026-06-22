package cibuild

import (
	"context"
	"testing"

	"github.com/lodthe/clickhouse-playground/internal/buildtype"
	"github.com/lodthe/clickhouse-playground/pkg/clickhousebuilds"

	"github.com/rs/zerolog"
)

type mockClient struct {
	sha    string
	shaErr error

	recentSHAs []string
	recentErr  error

	report    *clickhousebuilds.Report
	reportErr error

	gotRef string
}

func (m *mockClient) ResolveCommitSHA(_ context.Context, _ string) (string, error) {
	return m.sha, m.shaErr
}

func (m *mockClient) GetRecentCommitSHAs(_ context.Context, _ string, _ int) ([]string, error) {
	return m.recentSHAs, m.recentErr
}

func (m *mockClient) GetReleaseBranchReport(_ context.Context, ref, _ string) (*clickhousebuilds.Report, error) {
	m.gotRef = ref
	return m.report, m.reportErr
}

const base = "https://clickhouse-builds.s3.amazonaws.com/REFs/26.3/abc/build_amd_asan/"

func asanReport() *clickhousebuilds.Report {
	return &clickhousebuilds.Report{
		Name:   "ReleaseBranchCI",
		Status: "success",
		Results: []clickhousebuilds.Result{
			{Name: "Build (amd_release)", Status: "success"},
			{
				Name:   "Build (amd_asan)",
				Status: "success",
				Links: []string{
					base + "clickhouse",
					base + "clickhouse-common-static-dbg_26.3.14.45_amd64.deb",
					base + "clickhouse-common-static_26.3.14.45_amd64.deb",
					base + "clickhouse-keeper_26.3.14.45_amd64.deb",
					base + "clickhouse-client_26.3.14.45_amd64.deb",
					base + "clickhouse-server_26.3.14.45_amd64.deb",
					base + "job.log",
				},
			},
		},
	}
}

func newTestResolver(c buildsClient) *resolver {
	return &resolver{cli: c, logger: zerolog.Nop(), ttl: DefaultCacheTTL, cache: map[string]cacheEntry{}}
}

func TestResolveSuccess(t *testing.T) {
	m := &mockClient{sha: "abc", report: asanReport()}
	r := newTestResolver(m)

	spec, err := r.Resolve(context.Background(), "26.3.14.45", buildtype.ASAN)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if m.gotRef != "26.3" {
		t.Errorf("ref = %q, want 26.3", m.gotRef)
	}
	if spec.Version != "26.3.14.45" {
		t.Errorf("version = %q", spec.Version)
	}

	want := []string{
		base + "clickhouse-common-static_26.3.14.45_amd64.deb",
		base + "clickhouse-server_26.3.14.45_amd64.deb",
		base + "clickhouse-client_26.3.14.45_amd64.deb",
	}
	if len(spec.DownloadURLs) != len(want) {
		t.Fatalf("got %d urls, want %d: %v", len(spec.DownloadURLs), len(want), spec.DownloadURLs)
	}
	for i := range want {
		if spec.DownloadURLs[i] != want[i] {
			t.Errorf("url[%d] = %q, want %q", i, spec.DownloadURLs[i], want[i])
		}
	}
}

func TestResolveShortRefUsesBranchCommits(t *testing.T) {
	// A "major.minor" ref does not map to a -stable tag; it must fall back to recent commits.
	m := &mockClient{recentSHAs: []string{"latestsha"}, report: asanReport()}
	r := newTestResolver(m)

	spec, err := r.Resolve(context.Background(), "26.2", buildtype.ASAN)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if m.gotRef != "26.2" {
		t.Errorf("ref = %q, want 26.2", m.gotRef)
	}
	if len(spec.DownloadURLs) != 3 {
		t.Errorf("got %d urls, want 3", len(spec.DownloadURLs))
	}
}

func TestResolveFullVersionFallsBackToBranch(t *testing.T) {
	// Full version whose -stable tag does not exist must fall back to recent branch commits.
	m := &mockClient{
		shaErr:     context.Canceled, // tag resolution fails
		recentSHAs: []string{"branchsha"},
		report:     asanReport(),
	}
	r := newTestResolver(m)

	if _, err := r.Resolve(context.Background(), "26.3.99.99", buildtype.ASAN); err != nil {
		t.Fatalf("expected fallback to succeed, got: %v", err)
	}
}

func TestResolveCachesResult(t *testing.T) {
	m := &mockClient{sha: "abc", report: asanReport()}
	r := newTestResolver(m)

	if _, err := r.Resolve(context.Background(), "26.3.14.45", buildtype.ASAN); err != nil {
		t.Fatalf("first resolve failed: %v", err)
	}
	// Break the client; a cached result must still be returned.
	m.report = nil
	m.reportErr = context.Canceled
	if _, err := r.Resolve(context.Background(), "26.3.14.45", buildtype.ASAN); err != nil {
		t.Fatalf("cached resolve failed: %v", err)
	}
}

func TestResolveReleaseRejected(t *testing.T) {
	r := newTestResolver(&mockClient{})
	if _, err := r.Resolve(context.Background(), "26.3.14.45", buildtype.Release); err == nil {
		t.Error("expected error for release build type")
	}
}

func TestResolveErrors(t *testing.T) {
	cases := []struct {
		name    string
		client  *mockClient
		version string
		bt      buildtype.BuildType
	}{
		{
			name:    "bad version",
			client:  &mockClient{sha: "abc", report: asanReport()},
			version: "head",
			bt:      buildtype.ASAN,
		},
		{
			name:    "missing job",
			client:  &mockClient{sha: "abc", report: asanReport()},
			version: "26.3.14.45",
			bt:      buildtype.TSAN, // no tsan job in fixture
		},
		{
			name: "failed job",
			client: &mockClient{sha: "abc", report: &clickhousebuilds.Report{
				Results: []clickhousebuilds.Result{{Name: "Build (amd_asan)", Status: "failure"}},
			}},
			version: "26.3.14.45",
			bt:      buildtype.ASAN,
		},
		{
			name: "missing package",
			client: &mockClient{sha: "abc", report: &clickhousebuilds.Report{
				Results: []clickhousebuilds.Result{{
					Name:   "Build (amd_asan)",
					Status: "success",
					Links:  []string{base + "clickhouse-server_26.3.14.45_amd64.deb"},
				}},
			}},
			version: "26.3.14.45",
			bt:      buildtype.ASAN,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := newTestResolver(c.client)
			if _, err := r.Resolve(context.Background(), c.version, c.bt); err == nil {
				t.Error("expected error, got nil")
			}
		})
	}
}

func TestReleaseBranchRef(t *testing.T) {
	cases := map[string]string{
		"26.3.14.45":  "26.3",
		"24.8.1.2684": "24.8",
	}
	for version, want := range cases {
		got, err := releaseBranchRef(version)
		if err != nil {
			t.Errorf("releaseBranchRef(%q): %v", version, err)
			continue
		}
		if got != want {
			t.Errorf("releaseBranchRef(%q) = %q, want %q", version, got, want)
		}
	}
	if _, err := releaseBranchRef("26"); err == nil {
		t.Error("expected error for single-part version")
	}
}
