package dockertag

import (
	"context"
	"testing"

	"github.com/pkg/errors"
	zlog "github.com/rs/zerolog/log"
	"github.com/stretchr/testify/assert"
)

type RegistryClientMock struct {
	tags    map[string][]string
	digests map[string]string // "repository:tag" -> digest

	digestCalls int
}

func (c *RegistryClientMock) GetTags(repository string) ([]string, error) {
	tags, exists := c.tags[repository]
	if !exists {
		return nil, errors.New("not found")
	}

	return tags, nil
}

func (c *RegistryClientMock) GetDigest(repository string, tag string) (string, error) {
	c.digestCalls++

	digest, exists := c.digests[repository+":"+tag]
	if !exists {
		return "", errors.New("not found")
	}

	return digest, nil
}

func TestGetImagesFromSeveralRepositories(t *testing.T) {
	config := Config{
		Repositories: []string{
			"a/clickhouse",
			"b/clickhouse",
		},
		ExpirationTime: DefaultExpirationTime,
	}
	cli := &RegistryClientMock{
		tags: map[string][]string{
			"a/clickhouse": {"latest", "latest-alpine"},
			"b/clickhouse": {"latest", "21.8"},
		},
	}

	cache := NewCache(context.Background(), config, zlog.Logger, cli)

	images, imgByTag, err := cache.getImagesFromSeveralRepositories(config.Repositories)
	assert.NoError(t, err)
	assert.Len(t, images, 3)
	assert.Len(t, imgByTag, 3)

	assert.Equal(t, "latest-alpine", images[0].Tag)
	assert.Equal(t, "latest", images[1].Tag)
	assert.Equal(t, "21.8", images[2].Tag)

	// If a tag is presented in several repositories, the first repository wins.
	assert.Equal(t, "a/clickhouse", imgByTag["latest"].Repository)

	for _, img := range images {
		assert.Equal(t, img, imgByTag[cache.normalizeTag(img.Tag)])
	}
}

func TestFindResolvesDigestLazily(t *testing.T) {
	config := Config{
		Repositories:   []string{"a/clickhouse"},
		ExpirationTime: DefaultExpirationTime,
	}
	cli := &RegistryClientMock{
		tags: map[string][]string{
			"a/clickhouse": {"24.3", "head"},
		},
		digests: map[string]string{
			"a/clickhouse:24.3": "sha256:abc",
		},
	}

	cache := NewCache(context.Background(), config, zlog.Logger, cli)
	assert.NoError(t, cache.Update())

	img, found := cache.Find("24.3")
	assert.True(t, found)
	assert.Equal(t, "sha256:abc", img.Digest)

	// The resolved digest is cached.
	img, found = cache.Find("24.3")
	assert.True(t, found)
	assert.Equal(t, "sha256:abc", img.Digest)
	assert.Equal(t, 1, cli.digestCalls)

	// A digest resolution failure is not fatal: the image is returned without a digest.
	img, found = cache.Find("head")
	assert.True(t, found)
	assert.Empty(t, img.Digest)

	_, found = cache.Find("unknown")
	assert.False(t, found)
}

func TestSortImages(t *testing.T) {
	tests := []struct {
		name   string
		input  []string
		wanted []string
	}{
		{
			name:   "a lot of different images",
			input:  []string{"1.2.3", "12.3.4", "1", "0.2", "head", "5.2.1", "5", "head-alpine"},
			wanted: []string{"head-alpine", "head", "12.3.4", "5.2.1", "5", "1.2.3", "1", "0.2"},
		},
		{
			name:   "must be dropped",
			input:  []string{"1.2.3", "12334", "head"},
			wanted: []string{"head", "1.2.3"},
		},
		{
			name:   "no priority images",
			input:  []string{"1.2.3", "12.3.4", "1", "0.2", "5.2.1", "5"},
			wanted: []string{"12.3.4", "5.2.1", "5", "1.2.3", "1", "0.2"},
		},
		{
			name:   "with semver incompatible",
			input:  []string{"1.2.3", "12.3.4", "1", "lololo.incompatible", "0.2", "head", "5.2.1", "1.2.3-alpine", "head-alpine", "1-alpine"},
			wanted: []string{"head-alpine", "head", "12.3.4", "5.2.1", "1.2.3-alpine", "1.2.3", "1-alpine", "1", "0.2", "lololo.incompatible"},
		},
	}

	config := Config{
		Repositories: []string{
			"a/clickhouse",
			"b/clickhouse",
		},
		ExpirationTime: DefaultExpirationTime,
	}
	cli := &RegistryClientMock{
		tags: make(map[string][]string),
	}

	cache := NewCache(context.Background(), config, zlog.Logger, cli)

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			imgByTag := make(map[string]Image, len(test.input))
			for _, tag := range test.input {
				imgByTag[tag] = Image{Tag: tag}
			}

			sorted := cache.sortImages(imgByTag)

			assert.Len(t, sorted, len(test.wanted))

			for i, expectedTag := range test.wanted {
				assert.Equal(t, expectedTag, sorted[i].Tag, "invalid tag #%d", i)
			}
		})
	}
}
