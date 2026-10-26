"""Import source-backed Brood War spell sprites and unit overlay sizing."""
import hashlib
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image
import sc_iscript as iscript

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'resources/original-spell-source'
OUT = ROOT / 'dist/original-animation-assets'
IMAGE_IDS = {
    'darkSwarm': 337,
    'lockdown': [361, 362, 363],
    'stasisImpact': 364,
    'stasisOverlay': [365, 366, 367],
    'matrixFront': [371, 372, 373],
    'matrixBack': [374, 375, 376],
    'matrixHit': [377, 378, 379],
    'irradiate': [380, 381, 382],
    'ensnareCloud': 383,
    'ensnareOverlay': [384, 385, 386],
    'plagueCloud': 387,
    'plagueOverlay': [388, 389, 390],
    'web': 951,
    'maelstromOverlay': [982, 983, 984],
    'maelstromImpact': 998,
}
LOGICAL_IDS = sorted({
    value for values in IMAGE_IDS.values()
    for value in (values if isinstance(values, list) else [values])
})
ALIASES = {366: 365, 381: 380, 382: 380}
TEAM_COLORS = {'blue': (60, 112, 245), 'red': (224, 56, 48)}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def verify_sources():
    manifest = json.loads((SOURCE / 'manifest.json').read_text())
    if manifest.get('schema') != 1 or not manifest.get('files'):
        raise SystemExit('Invalid original spell source manifest')
    expected = {entry['path']: entry for entry in manifest['files']}
    found = {p.relative_to(SOURCE).as_posix() for p in SOURCE.rglob('*') if p.is_file() and p.name != 'manifest.json'}
    if found != set(expected):
        raise SystemExit('Original spell source manifest file list mismatch')
    for name, entry in expected.items():
        data = (SOURCE / name).read_bytes()
        if len(data) != entry['bytes'] or sha256(data) != entry['sha256']:
            raise SystemExit('Original spell source checksum mismatch: ' + name)
    return manifest


def parse_atlas(path):
    data = path.read_bytes()
    magic, version, unused, layer_count, entry_count = struct.unpack_from('<I4H', data)
    if magic != 0x4d494e41 or entry_count != 1 or layer_count > 10:
        raise SystemExit('Invalid original .anim atlas header: ' + path.name)
    frame_count, reference, canvas_w, canvas_h, frame_offset = struct.unpack_from('<4HI', data, 332)
    if reference != 65535 or not frame_count or frame_offset + frame_count * 16 > len(data):
        raise SystemExit('Invalid original .anim frame table: ' + path.name)
    names = [data[12 + index * 32:44 + index * 32].split(b'\0')[0].decode() for index in range(10)]
    textures = {}
    for index in range(layer_count):
        pointer, size, width, height = struct.unpack_from('<IIHH', data, 344 + index * 12)
        if size:
            if pointer + size > len(data):
                raise SystemExit('Invalid original .anim layer: ' + path.name)
            textures[names[index]] = Image.open(io.BytesIO(data[pointer:pointer + size])).convert('RGBA')
    diffuse = textures.get('diffuse')
    if diffuse is None:
        raise SystemExit('Missing diffuse layer: ' + path.name)
    frames = []
    for index in range(frame_count):
        x, y, ox, oy, width, height, uvx, uvy = struct.unpack_from('<HHhh4H', data, frame_offset + index * 16)
        frame = [x / 2, y / 2, ox / 2, oy / 2, width / 2, height / 2]
        if (x + width) / 2 > diffuse.width or (y + height) / 2 > diffuse.height:
            raise SystemExit('Original frame outside diffuse atlas: ' + path.name)
        frames.append(frame)
    return {'diffuse': diffuse, 'teamcolor': textures.get('teamcolor'), 'frames': frames,
            'canvas': [canvas_w / 2, canvas_h / 2], 'count': frame_count}


def team_sheet(diffuse, mask, color):
    if mask is None:
        return diffuse
    arr = np.asarray(diffuse).astype(float)
    mask_pixels = np.asarray(mask)
    alpha = (mask_pixels[:, :, 0] / 255) * (mask_pixels[:, :, 3] / 255)
    light = arr[:, :, :3].max(axis=2) / 255
    replacement = np.asarray(color)[None, None, :] * np.maximum(0.25, light[:, :, None])
    arr[:, :, :3] = arr[:, :, :3] * (1 - alpha[:, :, None]) + replacement * alpha[:, :, None]
    return Image.fromarray(np.clip(arr, 0, 255).astype('uint8'))


def main():
    manifest = verify_sources()
    scripts = json.loads((ROOT / 'resources/original-animation-scripts.json').read_text())
    for relative, content in [('scripts/iscript.bin', 'iscript.bin'), ('arr/images.dat', 'images.dat'), ('arr/sprites.dat', 'sprites.dat')]:
        raw = (SOURCE / content).read_bytes()
        if sha256(raw) != scripts[relative]['sha256']:
            raise SystemExit('Original spell script source does not match checked animation scripts: ' + content)
    iscript.load_bytes((SOURCE / 'iscript.bin').read_bytes(), (SOURCE / 'images.dat').read_bytes(), (SOURCE / 'sprites.dat').read_bytes())
    images = json.loads((SOURCE / 'images.dat.json').read_text())
    units = json.loads((SOURCE / 'units.dat.json').read_text())
    if len(images) != 999 or len(units) != 228:
        raise SystemExit('Unexpected original DAT record count')
    image_by_id = {image['_id']: image for image in images}
    atlas_cache = {}
    graphics = {}
    OUT.mkdir(parents=True, exist_ok=True)
    output_files = {}

    for image_id in LOGICAL_IDS:
        source_id = ALIASES.get(image_id, image_id)
        source_name = f'HD2/anim/main_{source_id:03d}.anim'
        source_path = SOURCE / source_name
        if not source_path.is_file():
            raise SystemExit('Missing original spell atlas: ' + source_name)
        atlas = atlas_cache.setdefault(source_id, parse_atlas(source_path))
        record = image_by_id.get(image_id)
        if not record or image_by_id[source_id]['grp_file'] != record['grp_file']:
            raise SystemExit(f'Original image alias {image_id} does not share atlas {source_id}')
        paths = {}
        for team, color in TEAM_COLORS.items():
            sheet = team_sheet(atlas['diffuse'], atlas['teamcolor'], color)
            digest = sha256(sheet.tobytes())
            filename = output_files.get(digest)
            if filename is None:
                filename = f'spell-{source_id}-{team}.webp'
                destination = OUT / filename
                temporary = destination.with_suffix('.webp.tmp')
                sheet.save(temporary, 'WEBP', quality=90, method=5)
                if not temporary.is_file() or temporary.stat().st_size == 0:
                    raise SystemExit('Original spell atlas conversion produced an empty image: ' + source_name)
                temporary.replace(destination)
                output_files[digest] = filename
            elif not (OUT / filename).is_file() or (OUT / filename).stat().st_size == 0:
                raise SystemExit('Original spell atlas deduplication points to an empty image: ' + filename)
            paths[team] = 'original-animation-assets/' + filename
        tracks = {}
        for action, slot in [('idle', 0), ('death', 1)]:
            try:
                track = iscript.trace(image_id, slot)
            except ValueError as error:
                raise SystemExit(f'Could not decode original {action} script for image {image_id}: {error}')
            if track and any(frame[0] is not None and frame[0] >= atlas['count'] for frame in track['frames']):
                raise SystemExit(f'Original {action} script references a missing frame: {image_id}')
            tracks[action] = track
        graphics[str(image_id)] = {
            'canvas': atlas['canvas'], 'frames': atlas['frames'], 'images': paths,
            'turns': bool(record['gfx_turns']), 'drawFunction': record['draw_function'],
            'sourceImage': source_id, 'sourceGroup': record['grp_file'], 'iscriptId': iscript.image_script(image_id),
            'sourceFrameCount': atlas['count'], 'remapping': record['remapping'], 'shadows': [], 'tracks': tracks,
        }

    base_path = ROOT / 'dist/original-animation-data.json'
    base = json.loads(base_path.read_text())
    base.update(graphics)
    for image_id, name, slot in [(525, 'stormActive', 14), (944, 'heal', 13)]:
        graphic = base.get(str(image_id))
        if not graphic:
            raise SystemExit(f'Missing original image data for visual track {name}: {image_id}')
        try:
            track = iscript.trace(image_id, slot)
        except ValueError as error:
            raise SystemExit(f'Could not decode original {name} script for image {image_id}: {error}')
        if not track or not track['frames']:
            raise SystemExit(f'Original {name} script is empty for image {image_id}')
        if any(frame[0] is not None and frame[0] >= len(graphic['frames']) for frame in track['frames']):
            raise SystemExit(f'Original {name} script references a missing frame: {image_id}')
        graphic.setdefault('tracks', {})[name] = track
    base_path.write_text(json.dumps(base, separators=(',', ':')))
    overlay_sizes = {}
    for unit in units:
        flags = unit['special_ability_flags']
        overlay_sizes[str(unit['_id'])] = 2 if flags.get('use_large_overlays') else 1 if flags.get('use_medium_overlays') else 0
    visuals = {
        'sourceManifestSha256': sha256((SOURCE / 'manifest.json').read_bytes()),
        'images': IMAGE_IDS,
        'unitOverlaySizes': overlay_sizes,
    }
    (ROOT / 'dist/spell-visual-data.json').write_text(json.dumps(visuals, separators=(',', ':')))
    # Verify every source atlas is a readable WebP before writing the manifest input.
    used = {url.removeprefix('original-animation-assets/') for graphic in graphics.values() for url in graphic['images'].values()}
    for filename in used:
        path = OUT / filename
        if not path.is_file() or path.stat().st_size == 0:
            raise SystemExit('Original spell atlas image is missing or empty: ' + filename)
        with Image.open(path) as image:
            image.verify()
    for temporary in OUT.glob('spell-*.webp.tmp'):
        temporary.unlink()
    for path in OUT.glob('spell-*.webp'):
        if path.name not in used:
            path.unlink()
    print(f"Imported {len(graphics)} original spell and status sprites from {len(output_files)} team atlases.")


if __name__ == '__main__':
    main()
