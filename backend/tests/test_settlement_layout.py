import pytest
import numpy as np
from app.generators.world_pipeline import generate_full_world_slice

def test_layout_determinism():
    """
    Assert that running settlement layout generation multiple times with the
    same seed produces identical building and road positions.
    """
    world1 = generate_full_world_slice("Eldoria")
    world2 = generate_full_world_slice("Eldoria")
    
    layouts1 = world1["settlement_layouts"]
    layouts2 = world2["settlement_layouts"]
    
    assert len(layouts1) == len(layouts2)
    
    for l1, l2 in zip(layouts1, layouts2):
        assert l1["settlement_id"] == l2["settlement_id"]
        assert len(l1["buildings"]) == len(l2["buildings"])
        assert len(l1["local_roads"]) == len(l2["local_roads"])
        
        # Verify buildings match exactly in coordinates and naming
        for b1, b2 in zip(l1["buildings"], l2["buildings"]):
            assert b1["id"] == b2["id"]
            assert b1["x"] == b2["x"]
            assert b1["y"] == b2["y"]
            assert b1["width"] == b2["width"]
            assert b1["height"] == b2["height"]
            
        # Verify local roads match exactly
        for r1, r2 in zip(l1["local_roads"], l2["local_roads"]):
            assert r1["id"] == r2["id"]
            assert len(r1["path"]) == len(r2["path"])
            for pt1, pt2 in zip(r1["path"], r2["path"]):
                assert pt1["x"] == pt2["x"]
                assert pt1["y"] == pt2["y"]

def test_building_bounds_and_no_overlaps():
    """
    Assert that all buildings are perfectly aligned within global bounds [0, 127]
    and do not exhibit any spatial bounding box overlaps.
    """
    world = generate_full_world_slice("Eldoria")
    layouts = world["settlement_layouts"]
    
    for layout in layouts:
        # 128x128 global grid occupancy mask
        occupancy = np.zeros((128, 128), dtype=bool)
        
        for bld in layout["buildings"]:
            bx, by = bld["x"], bld["y"]
            bw, bh = bld["width"], bld["height"]
            
            # Assert bounds check
            assert 0 <= bx < 128
            assert 0 <= by < 128
            assert bx + bw <= 128
            assert by + bh <= 128
            
            # Assert no overlaps
            footprint_area = occupancy[by:by+bh, bx:bx+bw]
            assert not np.any(footprint_area), f"Collision detected for building {bld['id']} in settlement {layout['settlement_id']}"
            
            # Apply occupancy
            occupancy[by:by+bh, bx:bx+bw] = True

def test_road_connectivity_and_validity():
    """
    Assert that intra-settlement streets return fully connected sequences of adjacent
    coordinates without diagonal coordinate gaps or out-of-bounds coordinates.
    """
    world = generate_full_world_slice("Eldoria")
    layouts = world["settlement_layouts"]
    
    for layout in layouts:
        for road in layout["local_roads"]:
            path = road["path"]
            assert len(path) >= 1
            
            # Verify coordinates are in global bounds
            for pt in path:
                assert 0 <= pt["x"] < 128
                assert 0 <= pt["y"] < 128
                
            # Verify contiguity (Chebyshev distance <= 1 between sequential nodes)
            for i in range(len(path) - 1):
                p1, p2 = path[i], path[i+1]
                dx = abs(p1["x"] - p2["x"])
                dy = abs(p1["y"] - p2["y"])
                assert dx <= 1 and dy <= 1
                assert not (dx == 0 and dy == 0)

def test_house_scaling():
    """
    Assert that the house abstraction scales dynamically based on population metrics.
    """
    world = generate_full_world_slice("Eldoria")
    layouts = world["settlement_layouts"]
    
    for layout in layouts:
        settlement = next(s for s in world["settlements"] if s["id"] == layout["settlement_id"])
        
        # Houses abstractly scaled by population for towns: max(8, min(20, pop // 250))
        houses = [b for b in layout["buildings"] if b["type"] == "house"]
        
        if settlement["type"] == "town":
            expected_houses = max(8, min(20, settlement["population"] // 250))
            assert len(houses) == expected_houses
        else:
            # Outposts don't have standard residential houses (they have bunkhouses)
            assert len(houses) == 0
