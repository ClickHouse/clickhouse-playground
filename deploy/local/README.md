# Local deploy (build-variant feature check)

A self-contained, credential-free stack to try the debug/sanitizer build-variant feature
end to end: the backend (with local builds enabled), the UI, and a local DynamoDB.

## Run

```sh
docker compose -f deploy/local/docker-compose.yml up --build
```

Then open **http://localhost:3001**. The backend API is on **http://localhost:9000/api**.

## What it does

- **dynamodb-local** — in-memory DynamoDB; `ddb-init` creates the `QueryRuns` table.
- **backend** — built from this repo. Lists Docker Hub tags anonymously, stores runs in the
  local DynamoDB (`aws.endpoint_url`), and builds debug/sanitizer images on the host Docker
  daemon (mounted `docker.sock`). Local builds are enabled in `config.yml`.
- **ui** — built from `../../../clickhouse-playground-ui` with `API_URL=http://localhost:9000/api/`.

## Checking the feature

1. Pick a recent **version** (e.g. a `26.x.y.z` / `24.8.x.y` release tag) in the dropdown.
2. Pick a **Build** other than `release` (e.g. `asan`).
3. Click **Run query**. The first run resolves the version's CI artifacts and builds the
   image locally — this takes several minutes and shows a "Building … image" status. Once
   ready, the query runs; subsequent runs reuse the cached image.

`release` builds work exactly as before (pulled from Docker Hub).

## Notes

- Outbound internet is required: the backend pulls `ubuntu:22.04` and the CI `.deb` packages,
  and lists Docker Hub tags. Sanitizer/debug `.deb`s are large, so the first build is slow.
- Build artifacts age out of CI S3 for older patch releases; if a variant fails to prepare
  with a "report … does not exist or expired" error, pick a more recent release version.
- This stack is for local checking only. Production uses `../docker-compose.yml`.
