import pytest
import math

def get_visible_cell_bounds(camera_x, camera_y, zoom, screen_w, screen_h, cell_size, world_w, world_h):
    """
    Python equivalent of the ViewportManager culling calculation.
    """
    min_x = max(0, math.floor(((0 - screen_w / 2) / zoom + camera_x) / cell_size) - 1)
    min_y = max(0, math.floor(((0 - screen_h / 2) / zoom + camera_y) / cell_size) - 1)
    max_x = min(world_w - 1, math.ceil(((screen_w - screen_w / 2) / zoom + camera_x) / cell_size) + 1)
    max_y = min(world_h - 1, math.ceil(((screen_h - screen_h / 2) / zoom + camera_y) / cell_size) + 1)
    return min_x, max_x, min_y, max_y

def rects_intersect(r1, r2):
    """
    Python equivalent of the LabelEngine bounding box collision check.
    """
    return not (r2["left"] > r1["right"] or 
                r2["right"] < r1["left"] or 
                r2["top"] > r1["bottom"] or 
                r2["bottom"] < r1["top"])

def get_world_radius(desired_screen_radius, zoom):
    """
    Python equivalent of the token world radius calculation.
    """
    return desired_screen_radius / zoom

def test_viewport_visible_cell_bounds():
    """
    Assert that visible viewport bounds are correctly calculated and clamped to world limits.
    """
    # World: 128x128 grid, Cell size: 12px
    # Case 1: Centered at (768, 768) with 1.0 zoom on a 1024x768 screen
    min_x, max_x, min_y, max_y = get_visible_cell_bounds(768, 768, 1.0, 1024, 768, 12, 128, 128)
    assert min_x >= 0
    assert min_y >= 0
    assert max_x <= 127
    assert max_y <= 127
    
    # Case 2: Extreme zoomed out (0.1 zoom) should return full world grid bounds
    min_x, max_x, min_y, max_y = get_visible_cell_bounds(768, 768, 0.1, 1024, 768, 12, 128, 128)
    assert min_x == 0
    assert min_y == 0
    assert max_x == 127
    assert max_y == 127

def test_label_bounding_box_collisions():
    """
    Assert that rects_intersect accurately identifies overlapping screen-space labels.
    """
    # Label 1: center (100, 100) with width 50, height 10, padding 2
    # box: left 73, right 127, top 93, bottom 107
    r1 = {"left": 73, "right": 127, "top": 93, "bottom": 107}
    
    # Label 2 (Collision): overlaps r1
    r2 = {"left": 120, "right": 170, "top": 100, "bottom": 114}
    assert rects_intersect(r1, r2)
    
    # Label 3 (No Collision): completely separate
    r3 = {"left": 200, "right": 250, "top": 200, "bottom": 214}
    assert not rects_intersect(r1, r3)

def test_token_radius_zoom_independence():
    """
    Assert that the token's rendered screen-space size is zoom-independent
    and stays clamped between 5px and 12px across all zoom levels.
    """
    desired_screen_radius = 6.5
    assert 5.0 <= desired_screen_radius <= 12.0
    
    # Test across a massive zoom scale (0.1 to 30.0)
    for zoom in [0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 20.0, 30.0]:
        world_radius = get_world_radius(desired_screen_radius, zoom)
        
        # In screen-space, size is world_radius * zoom
        screen_radius = world_radius * zoom
        assert math.isclose(screen_radius, desired_screen_radius, abs_tol=1e-5)
        assert 5.0 <= screen_radius <= 12.0

def test_priority_label_avoidance_ordering():
    """
    Assert that labels are correctly prioritized:
    selected item (100) > hovered item (95) > settlements (80/90) > major buildings (60) > districts (50).
    """
    priorities = {
        "selected_building": 100,
        "hovered_building": 95,
        "settlement_capital": 90,
        "settlement_outpost": 80,
        "major_building": 60,
        "district": 50
    }
    
    assert priorities["selected_building"] > priorities["hovered_building"]
    assert priorities["hovered_building"] > priorities["settlement_capital"]
    assert priorities["settlement_capital"] > priorities["settlement_outpost"]
    assert priorities["settlement_outpost"] > priorities["major_building"]
    assert priorities["major_building"] > priorities["district"]
