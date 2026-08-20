package restapi

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/lodthe/clickhouse-playground/internal/buildtype"
	"github.com/lodthe/clickhouse-playground/internal/dbsettings/runsettings"
	"github.com/lodthe/clickhouse-playground/internal/qrunner"
	"github.com/lodthe/clickhouse-playground/internal/queryrun"

	"github.com/go-chi/chi/v5"
	"github.com/pkg/errors"
	zlog "github.com/rs/zerolog/log"
)

const (
	ClickHouseDatabase = "clickhouse"
)

type queryHandler struct {
	r       QueryRunner
	runRepo queryrun.Repository

	tagStorage TagStorage

	maxQueryLength  uint64
	maxOutputLength uint64
}

func newQueryHandler(r QueryRunner, runRepo queryrun.Repository, storage TagStorage, maxQueryLength, maxOutputLength uint64) *queryHandler {
	return &queryHandler{
		r:               r,
		runRepo:         runRepo,
		tagStorage:      storage,
		maxQueryLength:  maxQueryLength,
		maxOutputLength: maxOutputLength,
	}
}

func (h *queryHandler) handle(r chi.Router) {
	r.Post("/runs", h.runQuery)
	r.Get("/runs/{id}", h.getQueryRun)
}

type RunQueryInput struct {
	Query            string `json:"query"`
	Version          string `json:"version"`
	IncludeRawOutput bool   `json:"include_raw_output"`
	// BuildType is the ClickHouse build kind: "release" (default), "debug", "asan", etc.
	BuildType string      `json:"build_type"`
	Database  string      `json:"database"`
	Settings  RunSettings `json:"settings"`
}

type RunSettings struct {
	ClickHouseSettings *ClickHouseSettings `json:"clickhouse,omitempty"`
}

type ClickHouseSettings struct {
	OutputFormat string `json:"output_format"`
}

type RunQueryOutput struct {
	QueryRunID   string `json:"query_run_id"`
	Output       string `json:"output"`
	OutputBase64 string `json:"output_base64,omitempty"`
	TimeElapsed  string `json:"time_elapsed"`
}

func convertSettings(req *RunQueryInput) (runsettings.RunSettings, error) {
	var runSettings runsettings.RunSettings

	switch req.Database {
	case ClickHouseDatabase:
		if req.Settings.ClickHouseSettings == nil {
			return &runsettings.ClickHouseSettings{}, nil
		}

		runSettings = &runsettings.ClickHouseSettings{
			OutputFormat: req.Settings.ClickHouseSettings.OutputFormat,
		}

	default:
		return nil, ErrUnknownDatabase
	}

	return runSettings, nil
}

func (h *queryHandler) runQuery(w http.ResponseWriter, r *http.Request) {
	var req RunQueryInput
	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		writeError(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Query == "" {
		writeError(w, "query cannot be empty", http.StatusBadRequest)
		return
	}
	if uint64(len(req.Query)) > h.maxQueryLength {
		msg := fmt.Sprintf("query length (%d) cannot exceed %d", len(req.Query), h.maxQueryLength)
		writeError(w, msg, http.StatusBadRequest)

		return
	}

	req.Version = strings.TrimSpace(req.Version)
	if !h.tagStorage.Exists(req.Version) {
		writeError(w, fmt.Sprintf("unknown version: %q", req.Version), http.StatusBadRequest)
		return
	}

	bt, err := buildtype.Parse(req.BuildType)
	if err != nil {
		writeError(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Set default database for backward compatibility
	if req.Database == "" {
		req.Database = ClickHouseDatabase
	}

	runSettings, err := convertSettings(&req)
	if err != nil {
		writeError(w, err.Error(), http.StatusBadRequest)
		return
	}

	run := queryrun.New(req.Query, req.Database, req.Version, bt.String(), runSettings)

	startedAt := time.Now()
	output, err := h.r.RunQuery(r.Context(), run)
	if err != nil {
		zlog.Error().Err(err).Interface("request", req).Msg("query run failed")

		switch {
		case errors.Is(err, qrunner.ErrNoAvailableRunners):
			writeError(w, err.Error(), http.StatusTooManyRequests)

		case errors.Is(err, qrunner.ErrImageNotReady):
			writeError(w, err.Error(), http.StatusConflict)

		case errors.Is(err, qrunner.ErrBuildsNotSupported):
			writeError(w, err.Error(), http.StatusNotImplemented)

		default:
			writeError(w, "internal error", http.StatusInternalServerError)
		}

		return
	}
	if uint64(len(output)) > h.maxOutputLength {
		msg := fmt.Sprintf("output length (%d) cannot exceed %d", len(output), h.maxOutputLength)
		writeError(w, msg, http.StatusBadRequest)

		return
	}

	timeElapsed := time.Since(startedAt)
	run.Output = output
	run.RawOutput = []byte(output)
	run.ExecutionTime = timeElapsed

	err = h.runRepo.Create(run)
	if err != nil {
		zlog.Error().Err(err).Interface("model", run).Msg("a run cannot be saved")
		writeError(w, "internal error", http.StatusInternalServerError)

		return
	}

	zlog.Info().Str("id", run.ID).Dur("elapsed", timeElapsed).Msg("saved a new run")

	result := RunQueryOutput{
		QueryRunID:  run.ID,
		Output:      run.Output,
		TimeElapsed: timeElapsed.Round(time.Millisecond).String(),
	}
	if req.IncludeRawOutput {
		result.OutputBase64 = encodeOutput(run.RawOutput)
	}
	writeResult(w, result)
}

type GetQueryRunInput struct {
	ID string `json:"id"`
}

type GetQueryRunOutput struct {
	QueryRunID   string                  `json:"query_run_id"`
	Database     string                  `json:"database,omitempty"`
	Version      string                  `json:"version"`
	BuildType    string                  `json:"build_type,omitempty"`
	Settings     runsettings.RunSettings `json:"settings,omitempty"`
	Input        string                  `json:"input"`
	Output       string                  `json:"output"`
	OutputBase64 string                  `json:"output_base64,omitempty"`
}

func encodeOutput(output []byte) string {
	return base64.StdEncoding.EncodeToString(output)
}

func rawOutput(run *queryrun.Run) []byte {
	if run.RawOutput != nil {
		return run.RawOutput
	}

	// Records written before RawOutput was introduced have only the legacy
	// string field. Its bytes are the best available representation.
	return []byte(run.Output)
}

func includeRawOutput(r *http.Request) bool {
	include, err := strconv.ParseBool(r.URL.Query().Get("include_raw_output"))
	return err == nil && include
}

func (h *queryHandler) getQueryRun(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, "missed id", http.StatusBadRequest)
		return
	}

	run, err := h.runRepo.Get(id)
	if errors.Is(err, queryrun.ErrNotFound) {
		writeError(w, "run not found", http.StatusNotFound)
		return
	}
	if err != nil {
		zlog.Error().Err(err).Str("id", id).Msg("failed to find a run")
		writeError(w, "internal error", http.StatusInternalServerError)

		return
	}

	result := GetQueryRunOutput{
		QueryRunID: run.ID,
		Database:   run.Database,
		Version:    run.Version,
		BuildType:  run.BuildType,
		Settings:   run.Settings,
		Input:      run.Input,
		Output:     run.Output,
	}
	if includeRawOutput(r) {
		result.OutputBase64 = encodeOutput(rawOutput(run))
	}
	writeResult(w, result)
}
