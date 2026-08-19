# ClickHouse Playground UI

A simple web application that allows people to interact with ClickHouse by running arbitrary SQL queries on arbitrary ClickHouse version.

Available at [fiddle.clickhouse.com](https://fiddle.clickhouse.com/).

The back-end engine lives alongside this application in the repository root.

## Running Locally

From the repository root:
```bash
cd ui
```

Install dependencies and start the development server:
```bash
npm install
npm start
```

## Running via Docker

Build a Docker image:
```bash
# Address of the backend API
export API_URL='https://fiddle.clickhouse.com/api/'

docker build --build-arg API_URL="$API_URL" -t clickhouse/clickhouse-fiddle-ui ./ui
```

Run a container based on the built image:
```bash
docker run -d -p 9090:80 clickhouse/clickhouse-fiddle-ui
```

Now the webapp is available on `localhost:9090`.
