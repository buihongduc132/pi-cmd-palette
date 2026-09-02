# Intention: Sunset cmd-activities (pi-session-activity)

- Date: 2026-09-02
- Source: user directive (goal mtkdvrix-f41vf7)
- Status: profile removal DONE (pi-plugins e6c74314); full-chain deploy IN PROGRESS
- Canonical copy: pi-plugins `flow/intentions/2026-09-02_sunset-cmd-activities.md` (commit e6c74314). This repo copy records the goal-local trail.
- Companion sunset: gitnexus (noco-mesh-infra) → `gitnexus-sunset.md` in this dir

## Request (verbatim)

> "add the flow/intentions/ to sunset these 2:
> - gitnexus ;
> - cmd activities ;"

## What "cmd activities" is

`pi-session-activity` extension (buihongduc132/pi-session-activity) — the `/activity-stats`,
`/activity-search`, `/activity-doctor`, `/activity-cache-clear` commands + first-turn
`[Activity ●24h]` context injection. Scans `~/.pi/agent/sessions/<encoded-cwd>/*.jsonl`
with byte-offset watermark cache.

## Why sunset

- User directive: superseded surface. Activity stats duplicated by atuin-history research
  and session-summary flows (pi-plugins `flow/findings/atuin/` + `dashboard-design.md`).
- First-turn context injection costs tokens every session with low observed value.

## Actions

1. [DONE] Remove `https://github.com/buihongduc132/pi-session-activity` from
   `pi-plugins/profile/settings.json` `packages[]` (commit e6c74314).
2. [IN PROGRESS] Deploy through full chain (LOCAL→wt→dev→staging→prod). Deploy blocker
   root-caused + fixed (pi-plugins 7104043d): reconcile now skips bundled `packages/<name>`
   when the stage copy exists (pi install resolved against repo cwd — wrong dir).
3. [POST-DEPLOY] Verify session-activity absent from all stage settings.json AND remove
   leftover `~/.pi/agent/git/github.com/buihongduc132/pi-session-activity` (rsync no-delete).

## NEVER-resurrect

Same rule as gitnexus: do NOT re-add pi-session-activity to packages[]. The atuin research
line (`flow/findings/atuin/`) is the successor design if activity data is ever needed again.
