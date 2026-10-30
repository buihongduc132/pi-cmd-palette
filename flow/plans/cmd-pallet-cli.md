# cmd-pallet CLI — full cmd-pallet capability as standalone binary

> Plan ID: `cmd-pallet-cli`
> Created: 2026-08-30 · Last reconciled: 2026-08-30 (gotcha-coverage appended)
> Status: done
> Items: 30 total (30 implemented, 0 pending)
> Branch: main (new repo `buihongduc132/cmd-pallet`)
> Location: flow/plans/cmd-pallet-cli.md

## Requirement (verbatim)

> "turns all of the capability that cmd-pallet is having into cli as well , make it as cmd-pallet"
> "ensure cli is tested and be able to run locally"

Source: $ARGUMENTS (user chain prompt) + exploration findings at
`flow/findings/2026-08-30-cmd_pallet_to_cli/` (capability map, locked decisions LD1-LD5).

## DOD (Definition of Done)
Plan done when ALL below true:
- [x] `cmd-pallet` binary installs + runs locally, exercising every cmd-pallet capability
- [x] `npm test` + `npm run typecheck` + smoke pass in the new repo
- [x] CLI output shapes match grok-adapter parity (list/read/run)
- [x] Repo pushed to buihongduc132/cmd-pallet

## Tasks

### Repo scaffold
- [x] repo-exists: git repo `buihongduc132/cmd-pallet` exists w/ package.json exposing `bin.cmd-pallet` and `type: module` TS (probe: `gh repo view` / file exists)
- [x] catalog-reuse: catalog loading consumes pi-unify-cmd pure extensions (`extensions/config.ts` + `extensions/discovery.ts` via consumePi-style resolution) — NO forked discovery (probe: grep imports)

### CLI verbs (capability parity)
- [x] verb-list: `cmd-pallet list [query]` prints all/matching commands; query path uses best-field-max fuzzy ranking name×3 / description×2 / body×1 (probe: run vs known catalog)
- [x] verb-read: `cmd-pallet read <name>` prints `# <name>` + argument-hint line + content, slash/`__`-tolerant name matching (probe: run)
- [x] verb-run: `cmd-pallet run <name> [args]` prints `Invoked: /<name> <args>` + interpolated body (`$ARGUMENTS`, `$1`, `$@` substitution) (probe: run)
- [x] verb-aliases: `cmd-pallet search <query>` ≡ list-with-query; `cmd-pallet get <name>` ≡ read (probe: run both)
- [x] verb-ping: `cmd-pallet ping` prints ok + catalog source info, exit 0 (probe: run)
- [x] verb-sync: `cmd-pallet sync [outdir]` writes one frontmatter markdown per catalog cmd + prints `synced=<n>` (probe: run into tmpdir)
- [x] verb-help: `cmd-pallet help` prints usage covering every verb + env vars (probe: run)
- [x] json-flag: every data verb accepts `--json` emitting JSON (probe: run each w/ --json | jq)

### Quality (locked LD2)
- [x] tests-pass: vitest suite co-located covering dispatch (all verbs + unknown + missing name), fuzzy ranking, interpolation, sync writer (probe: `npm test`)
- [x] typecheck-pass: `npm run typecheck` exits 0 (probe: run)
- [x] smoke-pass: smoke-test drives real catalog end-to-end (probe: `npm run smoke-test`)
- [x] local-run: `./bin` or `node --experimental-strip-types` entry runs from fresh clone after `npm install` (probe: fresh install + run)

### Docs
- [x] readme-parity: README documents usage, trust chain (pi-unify-cmd/pi-cmd-palette), and `cmd-pallet` vs `cmd-palette` distinction (probe: grep README)

### Gotcha-hardened contracts (from gotcha-coverage 2026-08-30 — appendix: flow/plans/cmd-pallet-cli-gotcha.md)
- [x] dep-resolution: package.json declares pi-unify-cmd via `github:buihongduc132/pi-unify-cmd`; loader = plain `--experimental-strip-types` (no shims needed) (probe: fresh temp dir `npm i <repo>` → `cmd-pallet ping` ok)
- [x] engines-gate: `engines.node>=22.18` + engine-strict + thin `.js` launcher owning NODE_OPTIONS strip-types + tsconfig `erasableSyntaxOnly`/`verbatimModuleSyntax`/`allowImportingTsExtensions` (probe: grep + node --version check in smoke)
- [x] arg-contract: `run` joins raw argv remainder for `$ARGUMENTS`/`$@`; `$1..$9` whitespace-split; quoting behavior documented + tested (probe: quoted two-word arg test)
- [x] interpolate-safe: substitution uses replacer functions; regression test `$&`/`` $` ``/`$'`/`$$` (probe: test file)
- [x] flag-parsing: flags filtered before positional extraction; `--` end-of-flags supported (probe: `get --json <name>` works)
- [x] output-contract: byte-level fixtures per verb (text + --json) pinned in tests; aliases format-identical to canonical verbs; `--json` errors = `{"error":...}` on stdout + exit 1; diagnostics → stderr; exit table 0 ok / 1 no-match / 2 config-deps (probe: fixture tests)
- [x] catalog-env: loader honors `PI_CODING_AGENT_DIR` before loadConfig (probe: env-override test)
- [x] help-safety: `help` loads NO catalog; `ping` catches load failure → structured fault + exit≠0; single VERBS table drives help+dispatch+test (probe: help w/ broken dep path)
- [x] sync-hygiene: written-set orphan cleanup + collision error + skipped-count stderr warn + `--dry-run` + write-only-if-changed (probe: tmpdir sync twice w/ removal)
- [x] smoke-fixture: default smoke runs against checked-in fixture catalog (env-gated real-catalog opt-in); asserts structural invariants only; explicit SKIP code when real absent (probe: CI-less run passes)
- [x] test-isolation: tests use per-test tmpdir for PI_CODING_AGENT_DIR + cache, TTL=0; cache file NEVER shared with cmd-palette (probe: grep env setup in tests)
- [x] read-golden: golden test asserts argument-hint line renders for real cmd w/ known hint; dup-name → candidates + exit 1; no leading `---` frontmatter leak (probe: tests)
- [x] run-docs: help + README state run prints expanded invocation, does not execute (probe: grep)
- [x] repo-hygiene: MIT LICENSE + .gitignore (node_modules) + public repo buihongduc132/cmd-pallet (probe: gh repo view --json visibility)
- [x] path-probe: `npm link` → `cmd-pallet ping` succeeds from another cwd (probe: run from /tmp)

## Idempotency
Re-running `/10-plan-declarative` on same requirement reconciles to THIS plan.
Implemented items auto-marked `- [x]`. Pending items surface as work-remaining.
DO NOT rewrite item prose on re-run (status flips only).

## Open Threads
- OT1 (searxng-outage): external >100-stars grounding skipped — low risk, port of own patterns
- OT2 (naming-collision): covered by readme-parity item
- OT3 (repo-provisioning): covered by repo-exists item
- OT4 (gotcha dep-resolution, rank 5): resolved into plan item dep-resolution — closed
- OT5 (gotcha output-contract, rank 4): resolved into plan item output-contract — closed

## Gotcha Coverage
- Appendix: `flow/plans/cmd-pallet-cli-gotcha.md` (2026-08-30, 4 parallel reviewers, 30 items total, 0 invalidating LD1-LD5)
- Rank 5: 1 · Rank 4: 8 · Rank 3: 8 · Rank 2: 6 · Rank 1: 2 → all rank ≥3 appended as items above
