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

## Follow-up implementation

The handoff follow-up is implemented on `codex/fix-map-combat-lurker-animations` at commit `9164fdd5f8a0c71b1836153a8a9d1f5b50809c48`. GitHub Actions run 41 passed. The remaining items below distinguish verified work from the one source-data limitation.

- A clean `npm run build` restored all 1,205 packed assets and all 68 original animation files. `npm run audit:animations` reports zero missing overlay graphics.
- `npm test` passes 109 JavaScript tests and 3 Python tests. The map geometry regression now reads the two placed Temple objects (unit 174, owners 3 and 7), rather than nearby Start Location markers (unit 214).
- The build derives the battlefield positions from those original Temple placements using the terrain's 90-degree rotation and centered crop. Team 0 is at (618.667, 1632); team 1 is at (618.667, 416). Battle setup and the attack-move objective use those derived coordinates.
- The death-visual cap is 12 seconds. The longest recovered playable-unit death/corpse track is 11.25 seconds (Ultralisk), so it is no longer cut off by the previous 8-second cap. A mobile DPR-2 stress profile with 76 units, 40 retained corpses and 12-second corpse visibility measured an 11.6 ms p95 frame callback (under the 16.7 ms 60 Hz budget); no pose cache was added.
- Both Chromium suites pass: the general 390 × 844 mobile/cache test and the original layered-sprite/death-timing suite. A mixed Archon/Lurker mobile wave with retained corpses was also inspected in the real renderer.
- `git diff --check` is clean. CI run 41 passed the clean resource build, animation audit, full test suite, mobile browser test, and visual artifact upload. The deploy job was skipped for this PR.

### Remaining source-data limitation

The repo's checksum-verified animation supplement contains `iscript.bin`, `images.dat`, and `sprites.dat`, but no `.lo`/`.tbl` attachment tables. The active recovered gameplay tracks that call `imgoluselo` are Archon body image 135 and Dark Archon body image 926; both create image 549 with script operands `(0, 0)`. The renderer currently preserves those literal offsets, but the attachment offsets stored in the source LO files have not been recovered. Do not claim complete Brood War attachment parity until that data is available and rendered. The core sprites and the mapped battlefield fixes are otherwise validated.

### Before closing PR #1

1. Push this follow-up and inspect CI for the resulting commit.
2. Update the PR description with the verified original assets, source-derived Temple coordinates, 12-second source-complete death visibility, and the remaining LO-data limit.
3. Keep the PR draft until the attachment-table issue is resolved or explicitly scoped out. Do not merge/deploy without the user's instruction.

## Important traps already found

- HD2 ANIM frame coordinates/canvas are authored at twice DDS texture resolution. Divide frame/canvas metadata by two; DO NOT resize the DDS atlas itself. An atlas-bounds regression now checks the real WebP dimensions. Double downsampling made four tiny orbs appear in one frame.
- Archon image 134 and Dark Archon 925 are mostly energy spheres. Bodies are 135 and 926; lightning/aura layers are 136 and 927. Preserve these after Init while walking/attacking. Merely drawing the main image is not the original unit.
- Image 153 aliases source image 151; image 442 aliases source image 427, as proved by original images.dat GRP references. Every exported frame is retained.
- The range branch for Archon body 135 changes overlay creation (image 549), not necessarily body frame numbers. The browser test checks the branch's actual overlay list rather than assuming different frames.
- Do not use the earlier 'all fixed' PR report as evidence. Use this commit's sources, audit, screenshots and CI.
