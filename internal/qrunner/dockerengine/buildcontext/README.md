# Vendored ClickHouse server image build context

These files are copied verbatim from the official ClickHouse server image build context
and are embedded into the binary (see `../embed.go`). They are used to build debug and
sanitizer images locally from CI `.deb` packages via the `DIRECT_DOWNLOAD_URLS` build arg.

Source: `docker/server/` in https://github.com/ClickHouse/ClickHouse
Pinned ref: `994f9d377c7adbe567ef3ba42a2e6b3a4f482e0b`

Files:
- `Dockerfile.ubuntu`
- `docker_related_config.xml`
- `entrypoint.sh`

Keeping a verbatim copy means locally built images set up the `clickhouse` user,
directories, and entrypoint exactly like the public release images the playground pulls
from Docker Hub. To update, re-copy all three files from the same upstream ref and bump
the ref above.
