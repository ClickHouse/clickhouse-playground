package dockertag

import "time"

const DefaultExpirationTime = 5 * time.Minute

type Config struct {
	Repositories []string

	ExpirationTime time.Duration
}
