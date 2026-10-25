# Luna handoff — original animation repair

## Branch and scope

Continue PR #1 on `codex/fix-map-combat-lurker-animations` in `prometheus26z/ministar`. Do not merge or claim completion just because behavioral tests pass. The user stopped the current work to conserve tokens. This document describes the actual latest files, not the obsolete PR description.

## Completed and locally checked

- Recovered 61 original files directly from Blizzard CDN, build 1.23.10.13515; content MD5 and SHA-256 verified. Source locations/ranges are pinned in `resources/original-animation-source.json`. No user ZIP is needed.
- Preserved original iscript.bin, images.dat and sprites.dat in `resources/original-animation-scripts.json`. Decoder tests compare exported timelines with those original bytes.
- Added the complete body/aura/corpse atlases, original timing, loop start, image creation/end events, layer ordering, random-wait ranges and Archon distance-dependent attack branch. Main Archon intro no longer loops. The Dark Archon death effect is 15 source ticks, not an invented 20-tick fallback.
- All original overlays referenced by the runtime audit resolve: `npm run audit:animations` reports zero missing graphics. The previous procedural circles/glows were removed.
- A checksum-verified supplement is stored as `resources/original-animations-*.b64` plus manifest. `tools/build.mjs` restores it via `restore-original-animations.mjs`. Generated JSON/textures are ignored by git, deliberately: the bundle contains them.
- `docs/original-animation-recovery.md` explains source recovery and regeneration commands. Conversion dependencies are pinned in `tools/original-animation-requirements.txt`.
- Local targeted JS tests passed (23 before the last added atlas regression; the atlas regression also passed separately). All 3 Python tests passed, including original-byte decoder comparison.
- Real Chromium 141 screenshots were inspected: Archon/Dark Archon idle, movement, near/far attack and death; Marine/Ghost/Medic/Zergling/Hydralisk/Ultralisk/Broodling/Drone/Queen/Defiler/Devourer/Dragoon/Lurker death sequences. The dedicated browser test passed. Screenshot generation is in `tests/original-animation-browser.cjs` and CI uploads the two images.
- Earlier repairs: disabled Lurkers update buffs/cooldowns before actions, cannot burrow while disabled or repeat an active transition. Cache version is now 0.16.4; browser migration assertions use package.json VERSION.

## Immediate remaining work

1. Inspect the CI run for THIS handoff commit. Full npm test and the old general mobile/cache browser suite have NOT been rerun after the final animation/resource additions. Run or inspect `npm run build`, `npm run audit:animations`, `npm test`, `node tests/browser.cjs`, `node tests/original-animation-browser.cjs`. Fix actual failures; do not weaken assertions merely to make CI green.
2. Check the bundled supplement restores from a clean checkout. A standalone restore passed locally, but a full clean build awaits CI. The expected manifest currently holds 68 files and 88 base64 parts; use the actual checked-in manifest as authoritative.
3. Review `sc_iscript.py` and sprite composition carefully. Only source opcodes exercised by recovered scripts are represented. Random-wait ranges are sampled deterministically per image instance; conditional range branches are preserved. LO-file attachment offsets (`imgoluselo`/`imguluselo`) are not fully evaluated by the current renderer; inspect ships/engine effects before claiming complete Brood War rendering parity. Archon and death examples were visually checked.
4. Check a live wave with mixed Archons/Lurkers and many corpses on mobile. The contact-sheet test exercises the real renderer and actual source images, but it is not a full gameplay/performance comparison. `pose()` currently allocates timed-frame arrays per draw; consider a bounded compiled-track cache only if profiling shows a real problem.
5. Confirm source death duration versus the existing core clamp (minimum 0.2s, maximum 8s). Active death effects shown in the inspected scenes finish, but long corpse persistence is still limited by the game policy. Do not silently change this policy without examining source behavior and memory/performance implications.
6. Recheck the map visually against original geometry in a real battle. The previous map crop/rotation and temple-coordinate regressions remain; they were not reworked in this resource pass.
7. Once latest CI and visual/gameplay checks are satisfactory, rewrite PR description to reflect the restored original assets and real validation. PR was deliberately left draft while assets were missing; resolve that status when appropriate. Do not merge/deploy without the user's instruction.

## Important traps already found

- HD2 ANIM frame coordinates/canvas are authored at twice DDS texture resolution. Divide frame/canvas metadata by two; DO NOT resize the DDS atlas itself. An atlas-bounds regression now checks the real WebP dimensions. Double downsampling made four tiny orbs appear in one frame.
- Archon image 134 and Dark Archon 925 are mostly energy spheres. Bodies are 135 and 926; lightning/aura layers are 136 and 927. Preserve these after Init while walking/attacking. Merely drawing the main image is not the original unit.
- Image 153 aliases source image 151; image 442 aliases source image 427, as proved by original images.dat GRP references. Every exported frame is retained.
- The range branch for Archon body 135 changes overlay creation (image 549), not necessarily body frame numbers. The browser test checks the branch's actual overlay list rather than assuming different frames.
- Do not use the earlier 'all fixed' PR report as evidence. Use this commit's sources, audit, screenshots and CI.
