package clickhousebuilds

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/rs/zerolog"
)

func TestResolveCommitSHA(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/repos/ClickHouse/ClickHouse/commits/v26.3.14.45-stable" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"sha":"276eb5833a3b176e90709028a6ddd6ee29aa29c4"}`))
	}))
	defer srv.Close()

	c := NewClient(zerolog.Nop(), Config{GitHubAPIURL: srv.URL})
	sha, err := c.ResolveCommitSHA(context.Background(), "v26.3.14.45-stable")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sha != "276eb5833a3b176e90709028a6ddd6ee29aa29c4" {
		t.Errorf("sha = %q", sha)
	}
}

func TestResolveCommitSHANotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := NewClient(zerolog.Nop(), Config{GitHubAPIURL: srv.URL})
	if _, err := c.ResolveCommitSHA(context.Background(), "v0.0.0.0-stable"); err == nil {
		t.Error("expected error for 404")
	}
}

func TestGetReleaseBranchReport(t *testing.T) {
	const body = `{"name":"ReleaseBranchCI","status":"success","results":[
		{"name":"Build (amd_asan)","status":"success","links":["https://x/clickhouse-server_26.3.14.45_amd64.deb"]}
	]}`

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/REFs/26.3/abc/result_releasebranchci.json" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	c := NewClient(zerolog.Nop(), Config{ReportBaseURL: srv.URL})
	report, err := c.GetReleaseBranchReport(context.Background(), "26.3", "abc")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	job, ok := report.FindResult("Build (amd_asan)")
	if !ok {
		t.Fatal("expected to find Build (amd_asan)")
	}
	if len(job.Links) != 1 {
		t.Errorf("links = %v", job.Links)
	}
}

func TestGetReleaseBranchReportExpired(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	c := NewClient(zerolog.Nop(), Config{ReportBaseURL: srv.URL})
	if _, err := c.GetReleaseBranchReport(context.Background(), "26.3", "abc"); err == nil {
		t.Error("expected error for expired/missing report")
	}
}
