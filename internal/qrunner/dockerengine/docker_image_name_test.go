package dockerengine

import (
	"strings"
	"testing"

	"github.com/lodthe/clickhouse-playground/internal/buildtype"

	"github.com/stretchr/testify/assert"
)

func TestFullImageName(t *testing.T) {
	cases := []struct {
		repository string
		version    string
		want       string
	}{
		{
			repository: "clickhouse/clickhouse-server",
			version:    "latest",
			want:       "clickhouse/clickhouse-server:latest",
		},
		{
			repository: "yandex/clickhouse-server",
			version:    "21.2.4",
			want:       "yandex/clickhouse-server:21.2.4",
		},
		{
			repository: "lodthe/clickhouse-playground",
			version:    "1.4-alpine",
			want:       "lodthe/clickhouse-playground:1.4-alpine",
		},
	}

	for _, tc := range cases {
		got := FullImageName(tc.repository, tc.version)
		assert.Equal(t, tc.want, got, tc.version)
	}
}

func TestPlaygroundImageName(t *testing.T) {
	actual := PlaygroundImageName("clickhouse/clickhouse-playground", "sha256:f321ba3999901412bc2616216a631f")
	expected := "chp-clickhouse/clickhouse-playground:f321ba3999901412bc2616216a631f"

	assert.Equal(t, expected, actual)
}

func TestIsPlaygroundImageName(t *testing.T) {
	chp := PlaygroundImageName("clickhouse/clickhouse-playground", "sha256:f321ba3999901412bc2616216a631f")
	notChp := "clickhouse/clickhouse-playground:21.2.2"

	assert.True(t, IsPlaygroundImageName(chp))
	assert.False(t, IsPlaygroundImageName(notChp))
}

func TestPlaygroundBuildImageName(t *testing.T) {
	urls := []string{"https://x/clickhouse-server_26.3.14.45_amd64.deb"}

	name := PlaygroundBuildImageName(buildtype.ASAN, "26.3.14.45", urls)

	assert.True(t, strings.HasPrefix(name, "chp-build-asan-26.3.14.45:"), name)
	assert.True(t, IsPlaygroundImageName(name))

	// Deterministic for the same inputs.
	assert.Equal(t, name, PlaygroundBuildImageName(buildtype.ASAN, "26.3.14.45", urls))

	// Changes when the artifacts change.
	other := PlaygroundBuildImageName(buildtype.ASAN, "26.3.14.45", []string{"https://x/other.deb"})
	assert.NotEqual(t, name, other)

	// Tag part is a valid 32-char hex digest.
	tag := name[strings.LastIndex(name, ":")+1:]
	assert.Len(t, tag, 32)
}

func TestSanitizeRef(t *testing.T) {
	assert.Equal(t, "26.3.14.45", sanitizeRef("26.3.14.45"))
	assert.Equal(t, "26.3.14.45-debug", sanitizeRef("26.3.14.45+debug"))
	assert.Equal(t, "abc-def", sanitizeRef("ABC/def"))
}
