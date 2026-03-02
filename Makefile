.PHONY: sync-skills

# Sync all skills from repo to ~/.codex/skills/
sync-skills:
	@REPO_SKILLS="$(PWD)/skills"; \
	TARGET="$(HOME)/.codex/skills"; \
	mkdir -p "$$TARGET"; \
	for d in "$$REPO_SKILLS"/*/; do \
		name=$$(basename "$$d"); \
		cp -r "$$d/." "$$TARGET/$$name/"; \
		echo "  synced: $$name"; \
	done; \
	echo "✅ skills synced → $$TARGET"
