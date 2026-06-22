package cibuild

import "time"

// DefaultCacheTTL is how long a successfully resolved BuildSpec is cached.
// Resolved artifacts are immutable, so this mostly avoids repeated GitHub/S3 calls.
const DefaultCacheTTL = 30 * time.Minute

type Config struct {
	// CacheTTL bounds how long resolved specs are cached. Defaults to DefaultCacheTTL.
	CacheTTL time.Duration
}
