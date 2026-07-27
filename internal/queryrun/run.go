package queryrun

import (
	"time"

	"github.com/lodthe/clickhouse-playground/internal/dbsettings/runsettings"

	"github.com/google/uuid"
)

type Run struct {
	ID string `dynamodbav:"Id"`

	Version string `dynamodbav:"Version"`
	// BuildType is the ClickHouse build kind (release/debug/asan/...). Empty means release.
	BuildType string `dynamodbav:"BuildType"`
	Input     string `dynamodbav:"Input"`
	Output    string `dynamodbav:"Output"`

	Database string                  `dynamodbav:"Database"`
	Settings runsettings.RunSettings `dynamodbav:"Settings"`

	CreatedAt     time.Time     `dynamodbav:"CreatedAt"`
	ExecutionTime time.Duration `dynamodbav:"ExecutionTime"`
}

func New(input string, database string, version string, buildType string, settings runsettings.RunSettings) *Run {
	return &Run{
		ID:        uuid.New().String(),
		CreatedAt: time.Now(),
		Input:     input,
		Database:  database,
		Version:   version,
		BuildType: buildType,
		Settings:  settings,
	}
}
