.PHONY: docker-publish-x86

docker-publish-x86:
	docker buildx build --platform linux/x86_64 -t clickhouse/clickhouse-fiddle .
	docker push clickhouse/clickhouse-fiddle
	@echo "Server image published"