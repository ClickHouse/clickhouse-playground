# Playground API specification

Users interact with the platform via the exposed HTTP API.

The project is in the beta stage, so 
backward compatibility may be broken (in extreme situations).

## Authorization and authentication

---

There are no auth mechanisms at the moment. You are not required to 
provide a token, credentials or something else to send a request. 
There are plans to integrate SSO-based auth.

## Response structure

---

All responses have the following JSON structure:

```yml
{
  [optional] error: {
    message: string,
    code: int
  },
  [optional] result: {
    // payload
  }
}
```

Responses have either `error` or `result` fields that describe 
an occurred error or contains payload respectively.

Examples:
```yml
# Error:
{
  "error": {
    "message": "invalid ClickHouse version",
    "code": 400
  }
}

# Success:
{
  "result": {
    "query_run_id":"612e2b9e-12db-4644-a933-d0693a15ecb5",
    "output":"1\n",
    "time_elapsed":"1.069s"
  }
}
```

If a response payload is presented, the request has been processed 
correctly and the status code is 200.

## Endpoints

---

The base URI is `https://fiddle.clickhouse.com/`.

### List available ClickHouse versions

| GET    | /api/tags |
|--------|-----------|

Get available ClickHouse versions that can be used for running a query.
Returned versions are just DockerHub image tags.

<details>
    <summary>Response payload</summary>
    <table>
        <thead>
            <tr>
                <th>Field name</th>
                <th>Field type</th>
                <th>Description</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td rowspan=1>tags</td>
                <td rowspan=1>array[string]</td>
                <td>List of available ClickHouse versions (tags).</td>
            </tr>
        </tbody>
    </table>
</details>

Example:
```yml
curl -XGET https://fiddle.clickhouse.com/api/tags

# 200 OK
{
  "result": {
    "tags": [
      "head",
      "22.5.1", 
      "22.5.1-alpine", 
      ..., 
      "19.8"
    ]
   }
}
```

### List available build types

| GET    | /api/build-types |
|--------|------------------|

Get the selectable ClickHouse build types. `release` images are pulled from DockerHub; the
other build types (`debug`, `asan`, `tsan`, `msan`, `ubsan`) are built locally on demand from
ClickHouse CI artifacts and are only available when local builds are enabled on the server.

Example:
```yml
curl -XGET https://fiddle.clickhouse.com/api/build-types

# 200 OK
{
  "result": {
    "build_types": ["release", "debug", "asan", "tsan", "msan", "ubsan"]
  }
}
```

### Prepare a non-release build

| POST   | /api/images/prepare |
|--------|---------------------|

Non-release images are not published to DockerHub, so the server builds them locally from the
`.deb` packages produced by ClickHouse CI on release branches. These builds are large and slow
(minutes), so they are prepared asynchronously: call this endpoint to start the build, then poll
`GET /api/images/status` until the state is `ready` before running a query.

The request body has `version` (a tag from `/api/tags`) and `build_type`. The response payload
has `state` (`building`, `ready`, or `failed`), an optional `detail` describing the current
build stage while building (e.g. `Downloading packages`, `Installing packages`), and an
optional `error` when failed. `release` always returns `ready`.

Example:
```yml
curl -XPOST https://fiddle.clickhouse.com/api/images/prepare -d '{ \
  "version": "24.8.1.2684", \
  "build_type": "asan" \
}'

# 200 OK
{ "result": { "state": "building" } }

# Poll until ready:
curl -XGET 'https://fiddle.clickhouse.com/api/images/status?version=24.8.1.2684&build_type=asan'
# 200 OK
{ "result": { "state": "ready" } }
```

### Run a query

| POST   | /api/runs |
|--------|-----------|

The title speaks for itself.  Keep in mind, a new container is created 
for an incoming request, so it may some time to process the query 
(15 &ndash; 20 seconds for absent images).

<details>
    <summary>Request body</summary>
    <table>
        <thead>
            <tr>
                <th>Field name</th>
                <th>Field type</th>
                <th>Description</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td rowspan=1>version</td>
                <td rowspan=1>string</td>
                <td>A desired version of ClickHouse where the query will be run.</td>
            </tr>
            <tr>
                <td rowspan=1>query</td>
                <td rowspan=1>string</td>
                <td>Semicolon-separated list of SQL queries that will be run.</td>
            </tr>
            <tr>
                <td rowspan=1>build_type</td>
                <td rowspan=1>string</td>
                <td>
                    [optional] ClickHouse build kind: <code>release</code> (default), <code>debug</code>,
                    <code>asan</code>, <code>tsan</code>, <code>msan</code>, <code>ubsan</code>.
                    Non-release builds must be prepared first (see <em>Prepare a non-release build</em>);
                    otherwise the request fails with <code>409</code>.
                </td>
            </tr>
        </tbody>
    </table>
</details>

<details>
    <summary>Response payload</summary>
    <table>
        <thead>
            <tr>
                <th>Field name</th>
                <th>Field type</th>
                <th>Description</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td rowspan=1>query_run_id</td>
                <td rowspan=1>string</td>
                <td>May be used to get the query run details.</td>
            </tr>
            <tr>
                <td>output</td>
                <td>string</td>
                <td>Query run execution result.</td>
            </tr>
            <tr>
                <td>time_elapsed</td>
                <td>string</td>
                <td>How long it took to process the query on the server side.</td>
            </tr>
        </tbody>
    </table>
</details>

Example:
```yml
curl -XPOST https://fiddle.clickhouse.com/api/runs -d '{ \
  "version": "22.5.1", \
  "query": "SELECT * FROM numbers(0, 5)" \
}'

# 200 OK
{
  "result": {
    "query_run_id": "1bcb005d-f466-4036-a5e3-81c723096913",
    "output":"0\n1\n2\n3\n4\n",
    "time_elapsed":"1.069s"
  }
}
```

### Get a query execution result


| GET    | /api/runs/{query_run_id} |
|--------|--------------------------|

You can get information about a previously processed query.

<details>
    <summary>Endpoint parameters</summary>
    <table>
        <thead>
            <tr>
                <th>Field name</th>
                <th>Description</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td rowspan=1>query_run_id</td>
                <td>ID of a finished query run.</td>
            </tr>
        </tbody>
    </table>
</details>

<details>
    <summary>Response payload</summary>
    <table>
        <thead>
            <tr>
                <th>Field name</th>
                <th>Field type</th>
                <th>Description</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td rowspan=1>query_run_id</td>
                <td rowspan=1>string</td>
                <td>ID of the finished query run.</td>
            </tr>
            <tr>
                <td rowspan=1>version</td>
                <td rowspan=1>string</td>
                <td>What ClickHouse version has been used to run the query.</td>
            </tr>
            <tr>
                <td rowspan=1>build_type</td>
                <td rowspan=1>string</td>
                <td>Which build type was used (omitted for release builds).</td>
            </tr>
            <tr>
                <td>input</td>
                <td>string</td>
                <td>Provided queries.</td>
            </tr>
            <tr>
                <td>output</td>
                <td>string</td>
                <td>Query run execution result.</td>
            </tr>
        </tbody>
    </table>
</details>

Example:
```yml
curl -XGET https://fiddle.clickhouse.com/api/runs/1bcb005d-f466-4036-a5e3-81c723096913

# 200 OK
{
  "result": {
    "query_run_id": "1bcb005d-f466-4036-a5e3-81c723096913",
    "version": "latest",
    "input": "select * from numbers(0, 5)",
    "output": "0\n1\n2\n3\n4\n"
  }
}
```