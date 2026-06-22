package dockerengine

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/lodthe/clickhouse-playground/internal/buildtype"
)

func FullImageName(repository, version string) string {
	return fmt.Sprintf("%s:%s", repository, version)
}

func PlaygroundImageName(repository, digest string) string {
	return fmt.Sprintf("chp-%s:%s", repository, strings.TrimPrefix(digest, "sha256:"))
}

// PlaygroundBuildImageName builds a deterministic, content-addressed name for a locally
// built (debug/sanitizer) image. The download-URLs hash in the tag makes the name change
// whenever the underlying artifacts change, so the same name can be safely reused as a cache
// key across requests and restarts. The "chp-" prefix keeps it subject to the same image GC
// as pulled images (see IsPlaygroundImageName).
func PlaygroundBuildImageName(bt buildtype.BuildType, version string, downloadURLs []string) string {
	repo := fmt.Sprintf("chp-build-%s-%s", bt, sanitizeRef(version))

	return fmt.Sprintf("%s:%s", repo, hashURLs(downloadURLs))
}

func IsPlaygroundImageName(name string) bool {
	return strings.HasPrefix(name, "chp-")
}

// hashURLs returns a short hex digest of the download URLs, usable as a Docker image tag.
func hashURLs(urls []string) string {
	sum := sha256.Sum256([]byte(strings.Join(urls, "\n")))

	return hex.EncodeToString(sum[:])[:32]
}

// sanitizeRef replaces characters that are invalid in a Docker image name component with '-'.
func sanitizeRef(s string) string {
	s = strings.ToLower(s)

	return strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '.', r == '_', r == '-':
			return r
		default:
			return '-'
		}
	}, s)
}
