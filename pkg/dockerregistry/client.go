// Package dockerregistry lists Docker Hub image tags through the registry API
// (auth.docker.io + registry-1.docker.io) instead of the hub.docker.com web API,
// which is behind a Cloudflare challenge.
package dockerregistry

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sync"
	"time"

	"github.com/pkg/errors"
	"github.com/rs/zerolog"
	"go.uber.org/ratelimit"
)

const (
	DefaultRegistryURL = "https://registry-1.docker.io"
	DefaultAuthURL     = "https://auth.docker.io"
	DefaultService     = "registry.docker.io"
	DefaultMaxRPS      = 5
	DefaultPageSize    = 1000
)

// defaultTokenExpirySeconds is the expires_in value implied by the token spec
// when the auth server omits it.
const defaultTokenExpirySeconds = 60

// manifestAccept covers multi-arch indexes and single-platform manifests, both Docker and OCI.
const manifestAccept = "application/vnd.docker.distribution.manifest.list.v2+json, " +
	"application/vnd.oci.image.index.v1+json, " +
	"application/vnd.docker.distribution.manifest.v2+json, " +
	"application/vnd.oci.image.manifest.v1+json"

// Auth holds Docker Hub credentials (username + personal access token).
// They are optional: anonymous pull tokens are issued for public repositories,
// credentials only raise the rate limits.
type Auth struct {
	Username string
	Password string
}

type Client struct {
	registryURL string
	authURL     string
	service     string
	auth        Auth

	rl  ratelimit.Limiter
	log zerolog.Logger
	cli *http.Client

	mu     sync.Mutex
	tokens map[string]bearerToken // repository -> pull token
}

type bearerToken struct {
	value     string
	expiresAt time.Time
}

func NewClient(log zerolog.Logger, maxRPS int, auth Auth, httpCli ...*http.Client) *Client {
	c := &Client{
		registryURL: DefaultRegistryURL,
		authURL:     DefaultAuthURL,
		service:     DefaultService,
		auth:        auth,
		rl:          ratelimit.New(maxRPS),
		log:         log,
		cli:         http.DefaultClient,
		tokens:      make(map[string]bearerToken),
	}
	if len(httpCli) == 1 {
		c.cli = httpCli[0]
	}

	return c
}

// getToken returns a cached pull token for the repository or requests a new one.
func (c *Client) getToken(repository string) (string, error) {
	c.mu.Lock()
	t, found := c.tokens[repository]
	c.mu.Unlock()

	if found && time.Now().Before(t.expiresAt) {
		return t.value, nil
	}

	c.rl.Take()

	u := fmt.Sprintf("%s/token?service=%s&scope=%s",
		c.authURL, url.QueryEscape(c.service), url.QueryEscape("repository:"+repository+":pull"))

	req, err := http.NewRequest(http.MethodGet, u, http.NoBody)
	if err != nil {
		return "", errors.Wrap(err, "failed to create http request")
	}
	if c.auth.Username != "" {
		req.SetBasicAuth(c.auth.Username, c.auth.Password)
	}

	resp, err := c.cli.Do(req)
	if err != nil {
		return "", errors.Wrap(err, "request failed")
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", errors.Wrap(err, "body read failed")
	}
	if resp.StatusCode != http.StatusOK {
		return "", errors.Errorf("token request failed with status %d: %s", resp.StatusCode, truncateBody(body))
	}

	parsed := struct {
		Token     string `json:"token"`
		ExpiresIn int    `json:"expires_in"`
	}{}
	err = json.Unmarshal(body, &parsed)
	if err != nil {
		return "", errors.Wrap(err, "unmarshal failed")
	}
	if parsed.Token == "" {
		return "", errors.New("token response contains no token")
	}

	if parsed.ExpiresIn <= 0 {
		parsed.ExpiresIn = defaultTokenExpirySeconds
	}

	c.mu.Lock()
	c.tokens[repository] = bearerToken{
		value: parsed.Token,
		// Renew slightly earlier to survive clock skew and in-flight pagination.
		expiresAt: time.Now().Add(time.Duration(parsed.ExpiresIn)*time.Second - 10*time.Second),
	}
	c.mu.Unlock()

	return parsed.Token, nil
}

// GetTags returns all tags of the given repository.
func (c *Client) GetTags(repository string) ([]string, error) {
	startedAt := time.Now()

	nextURL := fmt.Sprintf("%s/v2/%s/tags/list?n=%d", c.registryURL, repository, DefaultPageSize)

	var tags []string
	var iterations int
	for nextURL != "" {
		iterations++

		token, err := c.getToken(repository)
		if err != nil {
			return nil, errors.Wrap(err, "failed to acquire a pull token")
		}

		page, next, err := c.getTagsPage(nextURL, token)
		if err != nil {
			return nil, err
		}

		tags = append(tags, page...)
		nextURL = next
	}

	c.log.Info().
		Dur("time_elapsed_ms", time.Since(startedAt)).
		Int("count_api_calls", iterations).
		Str("repository", repository).
		Int("count_image_tags", len(tags)).
		Msg("successfully fetched docker registry tags")

	return tags, nil
}

func (c *Client) getTagsPage(pageURL string, token string) (tags []string, next string, err error) {
	c.rl.Take()

	req, err := http.NewRequest(http.MethodGet, pageURL, http.NoBody)
	if err != nil {
		return nil, "", errors.Wrap(err, "failed to create http request")
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.cli.Do(req)
	if err != nil {
		return nil, "", errors.Wrap(err, "request failed")
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", errors.Wrap(err, "body read failed")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, "", errors.Errorf("tags request failed with status %d: %s", resp.StatusCode, truncateBody(body))
	}

	parsed := struct {
		Tags []string `json:"tags"`
	}{}
	err = json.Unmarshal(body, &parsed)
	if err != nil {
		c.log.Error().Err(err).Str("url", pageURL).Str("body", string(truncateBody(body))).Msg("failed to parse the tags response")

		return nil, "", errors.Wrap(err, "unmarshal failed")
	}

	next, err = c.nextPageURL(resp.Header.Get("Link"))
	if err != nil {
		return nil, "", err
	}

	return parsed.Tags, next, nil
}

var linkNextRe = regexp.MustCompile(`<([^>]+)>\s*;\s*rel="next"`)

// nextPageURL extracts the next page URL from an RFC 5988 Link header
// (`</v2/...?last=...&n=...>; rel="next"`). The URL may be relative to the registry root.
func (c *Client) nextPageURL(link string) (string, error) {
	if link == "" {
		return "", nil
	}

	m := linkNextRe.FindStringSubmatch(link)
	if m == nil {
		return "", nil
	}

	base, err := url.Parse(c.registryURL)
	if err != nil {
		return "", errors.Wrap(err, "invalid registry url")
	}
	ref, err := url.Parse(m[1])
	if err != nil {
		return "", errors.Wrap(err, "invalid link header url")
	}

	return base.ResolveReference(ref).String(), nil
}

// GetDigest resolves the manifest digest the tag currently points to (for multi-arch
// tags it is the digest of the manifest index). HEAD manifest requests are not counted
// towards Docker Hub pull limits.
func (c *Client) GetDigest(repository string, tag string) (string, error) {
	token, err := c.getToken(repository)
	if err != nil {
		return "", errors.Wrap(err, "failed to acquire a pull token")
	}

	c.rl.Take()

	u := fmt.Sprintf("%s/v2/%s/manifests/%s", c.registryURL, repository, tag)

	req, err := http.NewRequest(http.MethodHead, u, http.NoBody)
	if err != nil {
		return "", errors.Wrap(err, "failed to create http request")
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", manifestAccept)

	resp, err := c.cli.Do(req)
	if err != nil {
		return "", errors.Wrap(err, "request failed")
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode != http.StatusOK {
		return "", errors.Errorf("manifest request failed with status %d", resp.StatusCode)
	}

	digest := resp.Header.Get("Docker-Content-Digest")
	if digest == "" {
		return "", errors.New("response contains no Docker-Content-Digest header")
	}

	return digest, nil
}

func truncateBody(body []byte) []byte {
	const limit = 512
	if len(body) > limit {
		return body[:limit]
	}

	return body
}
