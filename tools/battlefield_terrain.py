"""Render the mobile arena from upright original terrain; requires Pillow."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TARGET = (1280, 2048)


def render_battlefield(source):
    # This crop is already 5:8. Never rotate, mirror, or independently scale axes:
    # StarCraft's cliff faces and shadows have a fixed screen-space perspective.
    if source.size != (800, 1280):
        raise ValueError("Expected the verified upright 800x1280 terrain crop")
    return source.convert("RGB").resize(TARGET, Image.Resampling.LANCZOS)


if __name__ == "__main__":
    source_path = ROOT / "resources/desertstrike/upright-field.webp"
    metadata = json.loads(source_path.with_suffix(".json").read_text())
    if hashlib.sha256(source_path.read_bytes()).hexdigest() != metadata["sourceSha256"]:
        raise ValueError("Upright terrain source checksum mismatch")
    with Image.open(source_path) as source:
        render_battlefield(source).save(
            ROOT / "dist/ds-assets/battlefield.webp", "WEBP", quality=90, method=6
        )
    print("Rendered upright mobile battlefield (1280x2048).")
