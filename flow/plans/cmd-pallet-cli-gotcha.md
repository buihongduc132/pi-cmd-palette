# Gotcha Coverage — cmd-pallet-cli plan

> Source: flow/plans/cmd-pallet-cli.md
> Mode: plan
> Sub-agents: 4 parallel workers (batch A repo/verbs, batch B verbs/parity, batch C quality/docs, batch D DOD/LD2)
> Units reviewed: repo-exists, catalog-reuse, verb-list, verb-read, verb-run, verb-aliases, verb-ping, verb-sync, verb-help, json-flag, tests-pass, typecheck-pass, smoke-pass, local-run, readme-parity, DOD1-4, LD2

## Findings (ranked, deduped across batches)

### Rank 5 (Sophisticated)

- **dep-resolution — pi-unify-cmd is NOT an npm dependency; consumePi is grok-plugin plumbing**
  - What: `consume-pi.cjs` resolves pi-unify-cmd from vendored `_pi-vendor/` + tsx loader + Module shims. Not on npm. Fresh clone `npm install` provides nothing; catalog-reuse + local-run DOD silently conflict.
  - Why missed: plan inherited the pattern NAME without the mechanism.
  - Severity: local-run + smoke DOD break on any machine without grok plugin layout.
  - Mitigation: declare `pi-unify-cmd` as `github:buihongduc132/pi-unify-cmd` dependency; config.ts/discovery.ts import only `node:*` + local files → shims NOT needed, plain `--experimental-strip-types` suffices; clean-container probe.

### Rank 4 (Significant)

- **arg-quoting — run arg tokenization shreds quoted args**
  - What: interpolate splits `full.trim().split(/\s+/)` — `"my change"` → `$1="my"`. CLI argv surface makes this a correctness bug (MCP callers passed one string, never hit it).
  - Mitigation: join raw argv remainder for `$ARGUMENTS`/`$@`; `$1..$9` whitespace-split parity; document + test both.
- **interpolate-safe — `$&`/`` $` ``/`$'` corrupt substitution**
  - What: `String.replace` with string replacement interprets `$`-sequences. Args containing `$&` corrupt emitted body.
  - Mitigation: replacer functions `() => full`; regression test.
- **flag-parsing — `--json` before positional breaks name extraction**
  - What: `args[1]`-style parsing makes `cmd-pallet get --json my-cmd` → name=`--json`.
  - Mitigation: filter flags BEFORE positional extraction; support `--` end-of-flags.
- **engines-gate — strip-types bin is Node-version fragile**
  - What: `.ts` bin needs Node ≥22.18 for unflagged strip-types (machine: 22.22.2 OK; others die cryptically). `tsc --noEmit` passes while runtime breaks (enums/namespaces not erasable).
  - Mitigation: `engines.node>=22.18` + engine-strict; thin `.js` launcher setting NODE_OPTIONS flag once; tsconfig `erasableSyntaxOnly` + `verbatimModuleSyntax` + `allowImportingTsExtensions`.
- **catalog-env — PI_CODING_AGENT_DIR ignored by pi-unify-cmd config**
  - What: config.ts hardcodes `~/.pi/agent/unify-cmd.json`. Multi-stage machine (wt/dev/staging share $HOME) → wrong-stage catalog reads.
  - Mitigation: loader wrapper honors `PI_CODING_AGENT_DIR` before loadConfig; env-override test.
- **help-safety — help/ping hard-depend on catalog load**
  - What: broken pi-unify-cmd install bricks help AND ping (the diagnostics you need most). New repo lacks `_pi-vendor` tree → guaranteed first-run failure shape.
  - Mitigation: help = pure text, loads NO catalog; ping catches load failure → structured fault + exit≠0.
- **sync-hygiene — stale files, slug collisions, silent skips**
  - What: blind writeFileSync leaves zombies after catalog removal; `grokCommandName` slugify+64-cap collides (`foo/bar` vs `foo-bar`); non-ASCII names → `""` silently skipped, count lies.
  - Mitigation: written-set tracking + delete-orphans, collision detect (error), skipped-count warn on stderr, `--dry-run`, write-only-if-changed.
- **output-contract — parity ambiguous; two competing list shapes; JSON error channel unspecified**
  - What: grok `listText` = `name\tdesc`; pi-cmd-palette CLI = `[kind] /name — desc`. `--json` shape undefined; `--json` errors ("No command named X" on stdout) break `| jq`. `search`/`get` aliases differ in format from `list`/`read` in reference impls.
  - Mitigation: pin byte-level fixtures per verb (text + JSON); aliases format-identical to canonical verbs; `--json` errors = `{"error":...}` + exit table; diagnostics always stderr; exit codes: 0 ok / 1 not-found-or-no-match / 2 config-deps-error.
- **empty-catalog exit — per-verb exit semantics undefined** (merged into output-contract)

### Rank 3 (Moderate)

- **smoke-fixture — "real catalog" smoke is environment-coupled**
  - What: real catalog = 190 cmds drifting daily; breaks on CI; or taught to always-pass.
  - Mitigation: checked-in fixture catalog default (env-gated real-catalog opt-in); assert structural invariants only; explicit SKIP code when real requested but absent.
- **test-isolation — cache/env pollution + parallel races**
  - Mitigation: per-test tmpdir for PI_CODING_AGENT_DIR + cache; TTL=0 in unit runs; NEVER share cache file with cmd-palette (different catalogs → cross-contamination).
- **ping-real-paths — adapter returns fake `configPath: "pi-unify-cmd/loadConfig"` placeholder**
  - Mitigation: surface real resolved paths + command count.
- **verbs-table — help drift (no enforcement help lists every verb)**
  - Mitigation: single VERBS table drives help + dispatch + vitest case.
- **read-golden — argumentHint naming (`argumentHint` vs `argument_hint`) unverified; dup-name first-wins silent; frontmatter leak risk**
  - Mitigation: golden test on real cmd w/ known argument-hint; ambiguity = list candidates + exit 1; assert no leading `---` block.
- **run-docs — "run" executes nothing (semantic gap)**
  - Mitigation: help + README banner: "prints expanded invocation; does not execute".
- **repo-hygiene — LICENSE/.gitignore/visibility unaddressed**
  - Mitigation: MIT LICENSE + .gitignore (node_modules) + public repo.
- **path-probe — no PATH-level probe of installed bin**
  - Mitigation: `npm link` → `cmd-pallet ping` from another cwd.

### Rank 2 (Minor)
- cache env naming: pick `CMD_PALLET_CACHE_TTL` (distinct from `CMD_PALETTE_CACHE_TTL`), document in help
- `files` allowlist: state tests run in-repo only; prepublishOnly = check
- `$10` substitutes as `$1`+`0` (loop caps at 9) — doc note
- fuzzy bonus constants may drift from pi fuzzy.ts (weights 3/2/1 confirmed both sides) — golden ordering test
- D-G9 correction: `cmd-palette` NOT currently on PATH on this machine — collision risk ≈0 today; README distinction still required
- help one-line distinction "for pi prompts/skills see cmd-palette" (extends OT2)

### Rank 1 (YAGNI)
- per-invocation discovery cost (~190 files) — revisit only if measured slow
- Windows paths/CRLF — out of scope

## Cross-references
- dep-resolution ↔ catalog-env ↔ help-safety (same loader seam) ↔ smoke-fixture (dependency mode decides fixture split)
- output-contract ↔ flag-parsing ↔ read-golden (one contract table)
- engines-gate covers strip-types + tsconfig + launcher in one fix
- No gotcha invalidates LD1-LD5 (user-locked decisions stand).

## Disposition
All rank 4/5 + rank 3 items → appended as new plan items under "Gotcha-hardened contracts" (append-only, stable IDs). Rank 2 → noted here + folded into relevant items where trivial.
