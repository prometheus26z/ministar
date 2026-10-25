# Performance recovery — v0.16.9

The earlier performance session did not leave a recoverable branch, PR or source copy in the accessible workspace. This change was implemented and measured anew after PR #4. Its tree was compared with the uploaded Git tree before review.

## Findings and changes

- Per-unit target acquisition, crowd scoring, separation, splash damage and ally retaliation scanned the full army repeatedly. A 128-pixel per-step grid narrows the broad phase; exact predicates and array order remain authoritative. Packed queries fall back to full scans when sorting most of the army would cost more.
- Every path-clearance sample also scanned all soldiers looking for buildings. Obstacle checks now scan a live structure list during the simulation step. New construction, deaths and construction-start flags remain immediately visible.
- Notifications from many simultaneous deaths rebuilt the panel repeatedly in the same JavaScript turn. Selection/change/group/production notifications now coalesce in one microtask. Phase, commands, sound and notices keep their immediate behavior.
- The renderer filters units outside the view before depth sorting. Existing sprite eligibility and building drawing are preserved.
- Expired corpses are removed once per second after the full source death duration. Pending Lurker spine waves retain their source until they finish. No combat cadence, unit cap, economic rule, weapon number or source animation duration was reduced.

## Reproducible CPU comparison

`node tools/profile-combat.mjs [repository-directory]` runs a seeded mixed Marine/Zealot/Zergling scenario with the same placements and 1/30-second steps. Ten steps warm up; the following 60 steps are measured. Reference and release runs were sequential on the same host, Node v24.22.1. The checked-in JSON contains raw summary values. The reference source is the gameplay from PR #4, tree `817ccd464b4cab2ceb74eabca0dd9a2db52f0959` (before its touch-test-only fix).

| Units | Scene | Before median ms | After median ms | Reduction | p95 ms before → after |
| ---: | --- | ---: | ---: | ---: | --- |
| 120 | march | 3.218 | 2.890 | 10.2% | 6.954 → 5.269 |
| 120 | contact | 4.311 | 2.516 | 41.6% | 13.020 → 7.646 |
| 360 | march | 29.344 | 18.329 | 37.5% | 41.419 → 31.416 |
| 360 | contact | 58.336 | 20.508 | 64.8% | 127.365 → 34.701 |
| 600 | march | 79.682 | 44.529 | 44.1% | 90.923 → 53.436 |
| 600 | contact | 186.647 | 72.181 | 61.3% | 305.789 → 99.333 |

These values measure CPU simulation step cost, not Android FPS. The 600-unit contact case remains above the 33.3 ms simulation budget; this release reduces the bottleneck but does not certify real-time performance for arbitrary army sizes. A* routing and packed melee remain expensive. Physical Galaxy Z Fold hardware was not available.

## Verification

- Build, generated building-catalog check, original animation audit.
- 129 JavaScript and 5 Python tests, including exact state comparison against a full-array broad phase and the original pair-separation loop for 96 mixed units after each of 180 steps.
- Boundary cells, same-step recalls/spawns, building construction/death, full corpse duration and pending spine-wave retention.
- GitHub CI runs the existing mobile/catalog/team/cache and original animation browser suites, plus `tests/performance-browser.cjs`: a 390×844, DPR-2 360-unit paused render profile, detected/undetected Dark Templar touch eligibility and a 2,000-notification burst producing one panel refresh. Render measurements are separate from the CPU simulation results. CI uploads its screenshot and JSON timing artifact.

The browser executable download was truncated in the local environment. Browser verification is performed in GitHub Actions; only successful runs are accepted for merging and deployment.
