.PHONY: serve serve-open build test test-e2e check

serve:
	npm run dev -- --port 8080 --host

serve-open:
	npm run dev -- --port 8080 --host --open

build:
	npm run build

test:
	npm test

test-e2e:
	npm run build && npm run test:e2e

check:
	npm run check
