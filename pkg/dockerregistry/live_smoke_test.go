package dockerregistry

import (
	"os"
	"testing"

	zlog "github.com/rs/zerolog/log"
)

func TestLiveSmoke(t *testing.T) {
	if os.Getenv("RUN_LIVE_TESTS") == "" {
		t.Skip("live test")
	}

	c := NewClient(zlog.Logger, DefaultMaxRPS, Auth{})

	tags, err := c.GetTags("clickhouse/clickhouse-server")
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("tags: %d, first: %v", len(tags), tags[:3])
	if len(tags) < 2000 {
		t.Fatalf("expected >2000 tags, got %d", len(tags))
	}

	digest, err := c.GetDigest("clickhouse/clickhouse-server", "latest")
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("latest digest: %s", digest)
}
