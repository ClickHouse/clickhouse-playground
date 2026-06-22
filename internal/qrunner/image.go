package qrunner

import "github.com/pkg/errors"

// ImageState describes the readiness of an image that must be built locally
// (debug/sanitizer builds) before a query can run against it.
type ImageState string

const (
	// ImageBuilding means the image is being built (or about to be).
	ImageBuilding ImageState = "building"
	// ImageReady means the image is present and a query can run against it.
	ImageReady ImageState = "ready"
	// ImageFailed means the last build attempt failed.
	ImageFailed ImageState = "failed"
)

// ImageStatus is the result of an EnsureImage call.
type ImageStatus struct {
	State ImageState `json:"state"`
	// Detail is a human-readable progress stage while State is ImageBuilding
	// (e.g. "Downloading packages", "Installing packages").
	Detail string `json:"detail,omitempty"`
	// Logs is a tail of the build output, streamed while State is ImageBuilding.
	Logs string `json:"logs,omitempty"`
	// Error holds the failure reason when State is ImageFailed.
	Error string `json:"error,omitempty"`
}

// ErrImageNotReady is returned by RunQuery when a non-release image has not been built yet.
// Callers should trigger EnsureImage (the prepare flow) and retry once it is ready.
var ErrImageNotReady = errors.New("image is not ready, prepare it first")

// ErrBuildsNotSupported is returned when a non-release build is requested but the runner
// is not configured to build images locally.
var ErrBuildsNotSupported = errors.New("local builds are not supported by this runner")
