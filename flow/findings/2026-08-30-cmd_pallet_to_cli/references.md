# References

> Sources consulted during this explore session.

## Source files
- `/home/bhd/.pi/agent/skills/cmd-pallet/SKILL.md` — cmd-pallet skill contract (list/read/run/help + cmd_list/cmd_search/cmd_get aliases; pi = source of trust)
- `/home/bhd/.pi/agent/prompts/10-ospx-explore.md` — explore-mode cmd (stance, guardrails)
- `/home/bhd/.pi/agent/prompts/_references/10-ospx-explore/search-strategies.md` — search playbook (>100 stars rule)
- `/home/bhd/.pi/agent/prompts/_references/10-ospx-explore/inherit-established.md` — inherit settled process, callout-only
- `/home/bhd/.pi/agent/prompts/_references/10-ospx-explore/minimal-approach.md` — barely-fit design, ≥3 over-engineer pairs
- `/home/bhd/.grok/plugins/cmd-pallet/README.md` — grok adapter usage surface
- `/home/bhd/.grok/plugins/cmd-pallet/ADAPTER_REPO` — repo URL buihongduc132/grok-cmd-pallet
- `/home/bhd/.grok/plugins/cmd-pallet/TRUST_SOURCE` — pi-unify-cmd + pi-cmd-palette trust chain
- `/home/bhd/.grok/plugins/cmd-pallet/scripts/cmd-pallet.sh` — thin bash client (list/help/ping/sync/get/read)
- `/home/bhd/.grok/plugins/cmd-pallet/scripts/catalog.cjs` — catalog CLI shim (list/ping/get/sync)
- `/home/bhd/.grok/plugins/cmd-pallet/scripts/mcp-server.cjs` — MCP tool surface + runCmd output shape
- `/home/bhd/.grok/plugins/_adapter-core/catalog.cjs` — consumePi discovery, findCommand, formatRead, syncSlashCommands, grokCommandName, slashMarkdown
- `/home/bhd/Documents/Projects/bhd/pi-unify-cmd/extensions/config.ts` — pure config loader (global + project deep-merge)
- `/home/bhd/Documents/Projects/bhd/pi-unify-cmd/extensions/discovery.ts` — pure multi-dir discovery with canonical dedupe
- `/home/bhd/Documents/Projects/bhd/cli-agent-cmd/scopes.yml` — catalog registry (pi: 190 cmds, opencode: 29)
- `/home/bhd/Documents/Projects/bhd/pi-cmd-palette/scripts/cli.ts` — existing bin `cmd-palette` (list/read/help, no run, no query)
- `/home/bhd/Documents/Projects/bhd/pi-cmd-palette/package.json` — bin wiring, scripts (vitest/typecheck/smoke)
- `/home/bhd/Documents/Projects/bhd/pi-cmd-palette/README.md` — fuzzy ranking weights, RUN re-injection design, sources table
- `/home/bhd/.pi/agent/skills/web-searching/SKILL.md` + `references/searxng.md` — search tooling (endpoint unreachable this session)

## Documents
- (none — external search unavailable, see OT1)

## Code patterns
- `consumePi(pkg, file)` adapter-core pattern — consume pi package pure extensions from non-pi runtime; reuse for CLI catalog loading
- RUN output shape `Invoked: /<name> <args>\n\n# <name>\n\n<interpolated>` — agent-reattachable invocation; inherit byte-for-byte
- Best-field-max fuzzy ranking (name×3 / description×2 / body×1) — shared by pi + grok sides; inherit
- TTL file cache shared between extension + CLI (`CMD_PALETTE_CACHE_TTL`, pi-cmd-palette cache.ts) — inherit pattern
- Co-located vitest + `node --experimental-strip-types` smoke — repo conventions to replicate
