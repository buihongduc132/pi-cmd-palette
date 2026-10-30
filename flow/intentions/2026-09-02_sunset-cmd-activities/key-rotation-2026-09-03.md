# Key Rotation — 2026-09-03 (goal mtkdvrix-f41vf7 leak remediation)

## bhd-litellm master key — ROTATED ✓
- Leaked: `sk-litellm-asdwasdq` (e4f48416 → GitHub, >24h live)
- New: rotated via repo-sanctioned flow — config.yaml + .env + consul `litellm/config/LITELLM_MASTER_KEY`, `safe_restart.sh` (13x5s healthy)
- Proof: new=200 /v1/models + models list restored; old=401
- Distributed: ~/.pi/agent + dev + staging + profile auth.json (4 files)

## omni-local key — NOT ROTATABLE BY AGENT (HOB)
- Leaked: `sk-e10d88c494fc9696-1d23ba-745e20c4` still returns 200 on :20128 (LIVE)
- Consul current: `omniroute/config/omni-local-key` = `sk-e10d88...-6dcfea-fff670de` (different)
- Both keys live simultaneously → omniroute accepts multiple user keys; leak persists
- Admin API (`/api/keys`) requires session auth (AUTH_001) — agent has none
- ACTION NEEDED (human): omniroute dashboard → revoke `...-1d23ba-745e20c4`, then
  purge git history (filter-repo) for e4f48416 or accept rotation-only per LSL rule
  (flow/lesson_learn/2026-08-27_secret-in-git-history-rotate.md)

## git history
- e4f48416 still contains both old literals on origin/main (recoverable)
- Rotation makes them dead/pointless — history rewrite optional per LSL rule
