package restapi

import (
	"encoding/base64"
	"net/http/httptest"
	"testing"

	"github.com/lodthe/clickhouse-playground/internal/queryrun"
	"github.com/stretchr/testify/require"
)

func TestEncodeOutputPreservesNonUTF8Bytes(t *testing.T) {
	original := []byte{0x00, 0x80, 0xff, 'A'}

	encoded := encodeOutput(original)
	decoded, err := base64.StdEncoding.DecodeString(encoded)

	require.NoError(t, err)
	require.Equal(t, original, decoded)
}

func TestRawOutputUsesStoredBytesAndFallsBackForLegacyRuns(t *testing.T) {
	stored := &queryrun.Run{Output: "legacy", RawOutput: []byte{0x80, 0xff}}
	legacy := &queryrun.Run{Output: "legacy"}

	require.Equal(t, []byte{0x80, 0xff}, rawOutput(stored))
	require.Equal(t, []byte("legacy"), rawOutput(legacy))
}

func TestIncludeRawOutput(t *testing.T) {
	require.True(t, includeRawOutput(httptest.NewRequest("GET", "/runs/id?include_raw_output=true", nil)))
	require.False(t, includeRawOutput(httptest.NewRequest("GET", "/runs/id?include_raw_output=false", nil)))
	require.False(t, includeRawOutput(httptest.NewRequest("GET", "/runs/id?include_raw_output=invalid", nil)))
}
