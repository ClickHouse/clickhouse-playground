package dockertag

type Image struct {
	Repository string
	Tag        string

	// Digest of the manifest (index) the tag currently points to.
	// Resolved lazily on Find; empty until the first successful resolution.
	Digest string
}
