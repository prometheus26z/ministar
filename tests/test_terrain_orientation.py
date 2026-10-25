"""Check real artwork orientation, not only the objective coordinate formulas."""
import hashlib
import json
import sys
import unittest
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from battlefield_terrain import render_battlefield


class TerrainOrientationTests(unittest.TestCase):
    def test_deployed_background_keeps_upright_source_pixels(self):
        path = ROOT / "resources/desertstrike/upright-field.webp"
        metadata = json.loads(path.with_suffix(".json").read_text())
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), metadata["sourceSha256"])
        with Image.open(path) as source, Image.open(ROOT / "dist/ds-assets/battlefield.webp") as deployed:
            self.assertEqual(source.size, (800, 1280))
            self.assertEqual(deployed.size, (1280, 2048))
            expected = source.convert("RGB").resize((1280, 2048), Image.Resampling.LANCZOS)
            # WebP is lossy. Compare each quadrant independently so a rotated,
            # mirrored, or stale deployed raster cannot pass a geometry test.
            for box in [(0, 0, 640, 1024), (640, 0, 1280, 1024),
                        (0, 1024, 640, 2048), (640, 1024, 1280, 2048)]:
                difference = ImageChops.difference(expected.crop(box), deployed.convert("RGB").crop(box))
                self.assertLess(max(ImageStat.Stat(difference).mean), 4)

    def test_rejects_a_rotated_source(self):
        with Image.open(ROOT / "resources/desertstrike/upright-field.webp") as source:
            with self.assertRaises(ValueError):
                render_battlefield(source.transpose(Image.Transpose.ROTATE_90))
