.PHONY: serve serve-open build test check

serve:
	npm run dev -- --port 8080 --host

serve-open:
	npm run dev -- --port 8080 --host --open

build:
	npm run build

test:
	npm test

check:
	npm run check
