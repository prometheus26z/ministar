"""Geometry helpers for fitting the original Desert Strike map to the game field."""


def centered_crop(width, height, target_width, target_height):
    """Return a centered crop preserving the source pixel aspect ratio."""
    target_ratio = target_width / target_height
    if width / height > target_ratio:
        crop_width = round(height * target_ratio)
        return (width - crop_width) // 2, 0, crop_width, height
    crop_height = round(width / target_ratio)
    return 0, (height - crop_height) // 2, width, crop_height


def map_point(x, y, source_width, source_height, target_width, target_height):
    """Map a source point through the importer's 90° CCW rotation and fit crop."""
    rotated_x, rotated_y = y, source_width - x
    rotated_width, rotated_height = source_height, source_width
    left, top, crop_width, crop_height = centered_crop(
        rotated_width, rotated_height, target_width, target_height
    )
    scale_x, scale_y = target_width / crop_width, target_height / crop_height
    if abs(scale_x - scale_y) > 1e-12:
        raise ValueError("map fit would distort the source terrain")
    return (rotated_x - left) * scale_x, (rotated_y - top) * scale_y
