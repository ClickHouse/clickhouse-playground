package restapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/lodthe/clickhouse-playground/internal/buildtype"
	"github.com/lodthe/clickhouse-playground/internal/qrunner"

	"github.com/go-chi/chi/v5"
	"github.com/pkg/errors"
	zlog "github.com/rs/zerolog/log"
)

type imageBuildHandler struct {
	preparer   ImagePreparer
	tagStorage TagStorage
}

func newImageBuildHandler(preparer ImagePreparer, storage TagStorage) *imageBuildHandler {
	return &imageBuildHandler{
		preparer:   preparer,
		tagStorage: storage,
	}
}

func (h *imageBuildHandler) handle(r chi.Router) {
	r.Get("/build-types", h.getBuildTypes)
	r.Post("/images/prepare", h.prepareImage)
	r.Get("/images/status", h.getImageStatus)
}

type GetBuildTypesOutput struct {
	BuildTypes []string `json:"build_types"`
}

func (h *imageBuildHandler) getBuildTypes(w http.ResponseWriter, _ *http.Request) {
	types := buildtype.All()

	names := make([]string, 0, len(types))
	for _, t := range types {
		names = append(names, t.String())
	}

	writeResult(w, GetBuildTypesOutput{BuildTypes: names})
}

type PrepareImageInput struct {
	Version   string `json:"version"`
	BuildType string `json:"build_type"`
}

type ImageStatusOutput struct {
	State  string `json:"state"`
	Detail string `json:"detail,omitempty"`
	Logs   string `json:"logs,omitempty"`
	Error  string `json:"error,omitempty"`
}

func (h *imageBuildHandler) prepareImage(w http.ResponseWriter, r *http.Request) {
	var req PrepareImageInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, err.Error(), http.StatusBadRequest)
		return
	}

	h.ensure(w, r, req.Version, req.BuildType)
}

func (h *imageBuildHandler) getImageStatus(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	h.ensure(w, r, q.Get("version"), q.Get("build_type"))
}

// ensure validates the inputs and reports the build status. It is shared by the prepare
// (POST) and status (GET) endpoints: EnsureImage is idempotent and starts a build only when
// one is needed, so polling it is safe.
func (h *imageBuildHandler) ensure(w http.ResponseWriter, r *http.Request, version, rawBuildType string) {
	version = strings.TrimSpace(version)
	if version == "" {
		writeError(w, "version cannot be empty", http.StatusBadRequest)
		return
	}
	if !h.tagStorage.Exists(version) {
		writeError(w, fmt.Sprintf("unknown version: %q", version), http.StatusBadRequest)
		return
	}

	bt, err := buildtype.Parse(rawBuildType)
	if err != nil {
		writeError(w, err.Error(), http.StatusBadRequest)
		return
	}

	status, err := h.preparer.EnsureImage(r.Context(), version, bt)
	if err != nil {
		switch {
		case errors.Is(err, qrunner.ErrBuildsNotSupported):
			writeError(w, err.Error(), http.StatusNotImplemented)
		case errors.Is(err, qrunner.ErrNoAvailableRunners):
			writeError(w, err.Error(), http.StatusTooManyRequests)
		default:
			zlog.Error().Err(err).Str("version", version).Str("build_type", bt.String()).Msg("failed to prepare image")
			writeError(w, err.Error(), http.StatusBadRequest)
		}

		return
	}

	writeResult(w, ImageStatusOutput{
		State:  string(status.State),
		Detail: status.Detail,
		Logs:   status.Logs,
		Error:  status.Error,
	})
}
