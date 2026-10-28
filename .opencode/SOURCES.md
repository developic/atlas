# Vendored skills

These skills are copied from upstream repositories and pinned so the project can be
reproduced offline. They are loaded automatically from `.opencode/skills/`.

Installed: 2026-10-27

| Upstream repository | Commit | Stars at install | License |
| --- | --- | --- | --- |
| https://github.com/obra/superpowers | `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b` | ~303,945 | MIT |
| https://github.com/anthropics/skills | `dbd4588f9e1033efb41dad4bef2f7947c8993d44` | ~183,155 | Per-skill `LICENSE.txt` |
| https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | `d14efff8ed1faa4187f004f79926f428c8074ec7` | ~139,190 | MIT |

## Skills

| Skill | Source path |
| --- | --- |
| `executing-plans` | `superpowers/skills/executing-plans` |
| `finishing-a-development-branch` | `superpowers/skills/finishing-a-development-branch` |
| `receiving-code-review` | `superpowers/skills/receiving-code-review` |
| `requesting-code-review` | `superpowers/skills/requesting-code-review` |
| `subagent-driven-development` | `superpowers/skills/subagent-driven-development` |
| `systematic-debugging` | `superpowers/skills/systematic-debugging` |
| `test-driven-development` | `superpowers/skills/test-driven-development` |
| `using-git-worktrees` | `superpowers/skills/using-git-worktrees` |
| `verification-before-completion` | `superpowers/skills/verification-before-completion` |
| `writing-plans` | `superpowers/skills/writing-plans` |
| `writing-skills` | `superpowers/skills/writing-skills` |
| `frontend-design` | `skills/skills/frontend-design` |
| `skill-creator` | `skills/skills/skill-creator` |
| `theme-factory` | `skills/skills/theme-factory` |
| `webapp-testing` | `skills/skills/webapp-testing` |
| `ui-ux-pro-max` | `ui-ux-pro-max-skill/.claude/skills/ui-ux-pro-max` |

## Local modifications

- `ui-ux-pro-max`: removed `scripts/tests/` to keep the vendored payload small.
  Runtime data, validation scripts, and `data/phosphor-icons-upstream.json` are intact.

## Updating

```sh
git clone --depth 1 <repo> /tmp/opencode/vendor/<name>
git -C /tmp/opencode/vendor/<name> rev-parse HEAD   # record new commit above
cp -R /tmp/opencode/vendor/<name>/<source path> .opencode/skills/<skill-id>/
```

Keep `SKILL.md` at the root of each skill directory. Review upstream changes before
copying; do not copy `node_modules` or generated caches.
