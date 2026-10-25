import math
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from map_geometry import centered_crop, map_point


class DesertStrikeMapGeometryTests(unittest.TestCase):
    def test_rotated_source_is_center_cropped_without_stretching(self):
        crop = centered_crop(2080, 3072, 1280, 2048)
        self.assertEqual(crop, (80, 0, 1920, 3072))
        self.assertTrue(math.isclose(1280 / crop[2], 2048 / crop[3]))

    def test_original_temples_land_on_the_vertical_battle_lane(self):
        original = json.loads(
            (Path(__file__).resolve().parents[1] / "resources/original-desertstrike.json").read_text()
        )
        field = next(location for location in original["map"]["locations"] if location["name"] == "Playing field")
        source_width = field["right"] - field["left"]
        source_height = field["bottom"] - field["top"]
        temples = {
            unit["owner"]: map_point(
                unit["x"] - field["left"],
                unit["y"] - field["top"],
                source_width,
                source_height,
                1280,
                2048,
            )
            for unit in original["map"]["units"]
            if unit["unitId"] == 174 and unit["owner"] in (3, 7)
        }
        self.assertEqual(set(temples), {3, 7})
        self.assertAlmostEqual(temples[3][0], 1856 / 3, places=8)
        self.assertAlmostEqual(temples[7][0], 1856 / 3, places=8)
        self.assertAlmostEqual(temples[3][1], 1632, places=8)
        self.assertAlmostEqual(temples[7][1], 416, places=8)
        self.assertNotAlmostEqual(temples[3][1], temples[7][1], delta=100)


if __name__ == "__main__":
    unittest.main()
