import math
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
        temples = [
            map_point(x, 1008, 3072, 2080, 1280, 2048)
            for x in (640, 2432)
        ]
        self.assertAlmostEqual(temples[0][0], temples[1][0], delta=1)
        self.assertAlmostEqual(temples[0][0], 619, delta=2)
        self.assertAlmostEqual(temples[0][1], 1621, delta=2)
        self.assertAlmostEqual(temples[1][1], 427, delta=2)
        self.assertNotAlmostEqual(temples[0][1], temples[1][1], delta=100)


if __name__ == "__main__":
    unittest.main()
