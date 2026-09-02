# Sunset: gitnexus (noco-mesh-infra)

- Date: 2026-09-02
- Source: user directive (goal mtkdvrix-f41vf7)
- Status: runtime takedown DONE (noco-mesh-infra 1d867a9); codification of residual
  working tree delegated to subagent (in progress)

## Request (verbatim)

> "ALSO , delegate sub agents into ../noco-mesh-infra and disable the gitnexus
> (in codified version , must have the commit and merge )"

## What was done

1. Runtime takedown — noco-mesh-infra commit `1d867a9`
   (goal mtimly2w-mxwkxy, intention: noco-mesh-infra
   `flow/intentions/2026-09-01_gitnexus-takedown/intention.md`):
   - housing removed from Pulumi source (index.ts + application-tier-housing)
   - nomad jobs stopped + purged (gitnexus, gitnexus-indexer)
   - rego/scripts cleaned; self-healer tombstone `_id_sunset: gitnexus`
2. Codification — delegated to worker subagent into ../noco-mesh-infra:
   - commit (a) `sunset(gitnexus): codify residual takedown` — all gitnexus-* service
     dirs deleted, ansible role deleted, backup scripts deleted, housing refs updated
   - commit (b) foreign WIP snapshot for non-gitnexus residual edits
   - landed on main directly (repo policy: already on main ⇒ commit = merge)

## NEVER-resurrect

Do NOT re-add gitnexus to Pulumi source, jobspecs, or self-healer critical-services
config. Self-healer would resurrect a zombie. Canonical intention lives in
noco-mesh-infra `flow/intentions/2026-09-01_gitnexus-takedown/intention.md`.
