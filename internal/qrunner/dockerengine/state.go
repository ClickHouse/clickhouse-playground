package dockerengine

import (
	"github.com/lodthe/clickhouse-playground/internal/buildtype"
	"github.com/lodthe/clickhouse-playground/internal/dbsettings/runsettings"
)

// requestState holds information about a processing query execution request.
type requestState struct {
	runID string

	database  string
	version   string
	buildType buildtype.BuildType
	query     string

	settings runsettings.RunSettings

	// <repository>:<version>
	imageTag string

	// a unique name that refers the image
	imageFQN string

	containerID string
}
