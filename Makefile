.PHONY: check build commit

check:
	npm run check

build:
	npm run build

commit:
	node scripts/commit.js "$(branch)" "$(message)"
