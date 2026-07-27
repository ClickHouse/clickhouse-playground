package dockerengine

import "embed"

// buildContextFS holds the vendored ClickHouse server image build context. It is used to
// build debug/sanitizer images locally from CI .deb packages. See buildcontext/README.md.
//
//go:embed buildcontext/Dockerfile.ubuntu buildcontext/docker_related_config.xml buildcontext/entrypoint.sh
var buildContextFS embed.FS

// buildContextDir is the directory inside buildContextFS that holds the build context files.
const buildContextDir = "buildcontext"

// dockerfileName is the Dockerfile to use within the build context.
const dockerfileName = "Dockerfile.ubuntu"
