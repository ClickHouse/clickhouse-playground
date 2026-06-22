package dockerengine

import (
	"archive/tar"
	"context"
	"io"
	"testing"

	"github.com/lodthe/clickhouse-playground/internal/cibuild"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildTarContext(t *testing.T) {
	buf, err := buildTarContext()
	require.NoError(t, err)

	modes := make(map[string]int64)
	tr := tar.NewReader(buf)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
		modes[hdr.Name] = hdr.Mode
	}

	// All three vendored build-context files must be present at the root.
	assert.Contains(t, modes, dockerfileName)
	assert.Contains(t, modes, "docker_related_config.xml")
	assert.Contains(t, modes, "entrypoint.sh")

	// The entrypoint must be executable.
	assert.Equal(t, int64(0o755), modes["entrypoint.sh"])
	assert.Equal(t, int64(0o644), modes[dockerfileName])
}

func TestBuildArgs(t *testing.T) {
	spec := cibuild.BuildSpec{
		Version:      "26.3.14.45",
		DownloadURLs: []string{"https://x/a.deb", "https://x/b.deb"},
	}

	args := buildArgs(spec)

	require.Contains(t, args, "DIRECT_DOWNLOAD_URLS")
	require.Contains(t, args, "VERSION")
	assert.Equal(t, "https://x/a.deb https://x/b.deb", *args["DIRECT_DOWNLOAD_URLS"])
	assert.Equal(t, "26.3.14.45", *args["VERSION"])
}

func TestBuildManagerDisabled(t *testing.T) {
	var m *buildManager
	assert.False(t, m.enabled())

	m = newBuildManager(context.Background(), zerolog.Nop(), nil, nil, BuildSettings{Enabled: false})
	assert.False(t, m.enabled())
}
