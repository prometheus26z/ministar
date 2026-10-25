# Original visual resources

The original overlay/body/corpse resources are now checked into the repository as a verified supplement. `npm run build` restores them automatically; no user-provided ZIP or local game installation is required.

- Origin: Blizzard's `https://us.cdn.blizzard.com/tpr/sc1live/` CDN, build 1.23.10.13515.
- `resources/original-animation-source.json` pins each original content MD5, SHA-256, archive/range or standalone encoded key, and frame count. It also records image aliases from the original images.dat GRP mapping.
- `resources/original-animation-scripts.json` preserves the original iscript.bin/images.dat/sprites.dat bytes for offline provenance and decoder regression checks.
- `resources/original-animations-manifest.json` and its base64 parts hold all shipped textures and compiled visual metadata with SHA-256 verification.

Rebuild from the original files:

```sh
npm run build
python -m pip install -r tools/original-animation-requirements.txt
python tools/fetch-original-animations.py /tmp/ministar-original/raw
python tools/import-original-animations.py /tmp/ministar-original/raw
python tools/pack-original-animations.py
npm run audit:animations
npm test
```

The importer preserves all source frames, explicit waits, random-wait ranges, loop entry points, near/far attack branches, image creation time/offset/layer, and end instructions. HD2 DDS textures already use half-resolution atlas coordinates; source frame coordinates and canvas metadata are divided by two, and the DDS texture itself is not resized.

Archon body/lightning layers are persistent after their source creation time; they continue to render while moving or attacking. The base death image can end before the effect it creates. Source-created corpse images are included instead of procedural circles. Browser regression checks render both Archons through idle, movement, range-dependent attack, and death, plus thirteen ground-unit death sequences.
