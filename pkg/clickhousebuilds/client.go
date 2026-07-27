// Package clickhousebuilds is a client for discovering ClickHouse CI build artifacts.
//
// On release branches, ClickHouse CI (praktika) publishes debug and sanitizer .deb
// packages to S3 and records their URLs in a per-commit report JSON. This client
// resolves a released version to its commit sha (via the GitHub API) and fetches the
// corresponding ReleaseBranchCI report.
package clickhousebuilds

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/pkg/errors"
	"github.com/rs/zerolog"
)

const (
	// DefaultReportBaseURL is the S3 location that hosts praktika report JSON files.
	DefaultReportBaseURL = "https://s3.amazonaws.com/clickhouse-test-reports"

	// DefaultGitHubAPIURL is the GitHub REST API base URL.
	DefaultGitHubAPIURL = "https://api.github.com"

	// DefaultRepository is the ClickHouse GitHub repository.
	DefaultRepository = "ClickHouse/ClickHouse"

	// releaseBranchCIReportFile is the report file name for the ReleaseBranchCI workflow.
	// It follows praktika's task-name normalization (lowercase, non-alphanumeric -> '_').
	releaseBranchCIReportFile = "result_releasebranchci.json"

	// errorBodyLimit bounds how much of an error response body is read for diagnostics.
	errorBodyLimit = 512
)

// Client fetches ClickHouse CI metadata from S3 and GitHub.
type Client struct {
	reportBaseURL string
	githubAPIURL  string
	repository    string
	githubToken   string

	cli *http.Client
	log zerolog.Logger
}

// Config configures a Client. Empty fields fall back to the Default* values.
type Config struct {
	ReportBaseURL string
	GitHubAPIURL  string
	Repository    string
	// GitHubToken is optional; it raises the GitHub API rate limit when set.
	GitHubToken string
}

func NewClient(log zerolog.Logger, cfg Config, httpCli ...*http.Client) *Client {
	c := &Client{
		reportBaseURL: cfg.ReportBaseURL,
		githubAPIURL:  cfg.GitHubAPIURL,
		repository:    cfg.Repository,
		githubToken:   cfg.GitHubToken,
		cli:           http.DefaultClient,
		log:           log,
	}

	// TODO: Move default value substitution to the config layer.
	if c.reportBaseURL == "" {
		c.reportBaseURL = DefaultReportBaseURL
	}
	if c.githubAPIURL == "" {
		c.githubAPIURL = DefaultGitHubAPIURL
	}
	if c.repository == "" {
		c.repository = DefaultRepository
	}
	if len(httpCli) == 1 && httpCli[0] != nil {
		c.cli = httpCli[0]
	}

	return c
}

// ResolveCommitSHA resolves a git ref (a tag such as "v26.3.14.45-stable", a branch, or
// a sha) to its commit sha using the GitHub API.
func (c *Client) ResolveCommitSHA(ctx context.Context, ref string) (string, error) {
	url := fmt.Sprintf("%s/repos/%s/commits/%s", c.githubAPIURL, c.repository, ref)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, http.NoBody)
	if err != nil {
		return "", errors.Wrap(err, "failed to create request")
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	if c.githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.githubToken)
	}

	resp, err := c.cli.Do(req)
	if err != nil {
		return "", errors.Wrap(err, "github request failed")
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return "", errors.Errorf("ref %q not found", ref)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, errorBodyLimit))
		return "", errors.Errorf("github returned %d: %s", resp.StatusCode, string(body))
	}

	var payload struct {
		SHA string `json:"sha"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", errors.Wrap(err, "failed to decode github response")
	}
	if payload.SHA == "" {
		return "", errors.Errorf("github returned empty sha for ref %q", ref)
	}

	return payload.SHA, nil
}

// GetRecentCommitSHAs returns up to limit of the most recent commit shas on a release branch
// ref (e.g. "26.3"), newest first. It reads the branch's commits.json, where commits are
// ordered oldest to newest.
func (c *Client) GetRecentCommitSHAs(ctx context.Context, ref string, limit int) ([]string, error) {
	url := fmt.Sprintf("%s/REFs/%s/commits.json", c.reportBaseURL, ref)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, http.NoBody)
	if err != nil {
		return nil, errors.Wrap(err, "failed to create request")
	}

	resp, err := c.cli.Do(req)
	if err != nil {
		return nil, errors.Wrap(err, "commits request failed")
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusNotFound {
		return nil, errors.Errorf("no release branch %q found (status %d)", ref, resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, errorBodyLimit))
		return nil, errors.Errorf("commits request returned %d: %s", resp.StatusCode, string(body))
	}

	var commits []struct {
		SHA string `json:"sha"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&commits); err != nil {
		return nil, errors.Wrap(err, "failed to decode commits")
	}

	shas := make([]string, 0, limit)
	for i := len(commits) - 1; i >= 0 && len(shas) < limit; i-- {
		if commits[i].SHA != "" {
			shas = append(shas, commits[i].SHA)
		}
	}

	return shas, nil
}

// GetReleaseBranchReport fetches the ReleaseBranchCI report for the given release-branch
// ref (e.g. "26.3") and commit sha.
func (c *Client) GetReleaseBranchReport(ctx context.Context, ref, sha string) (*Report, error) {
	url := fmt.Sprintf("%s/REFs/%s/%s/%s", c.reportBaseURL, ref, sha, releaseBranchCIReportFile)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, http.NoBody)
	if err != nil {
		return nil, errors.Wrap(err, "failed to create request")
	}

	resp, err := c.cli.Do(req)
	if err != nil {
		return nil, errors.Wrap(err, "report request failed")
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusNotFound {
		return nil, errors.Errorf("report for %s@%s does not exist or expired (status %d)", ref, sha, resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, errorBodyLimit))
		return nil, errors.Errorf("report request returned %d: %s", resp.StatusCode, string(body))
	}

	report := new(Report)
	if err := json.NewDecoder(resp.Body).Decode(report); err != nil {
		return nil, errors.Wrap(err, "failed to decode report")
	}

	c.log.Debug().Str("ref", ref).Str("sha", sha).Int("results", len(report.Results)).Msg("fetched release branch report")

	return report, nil
}
