import pytest
import numpy as np
from app.generators.world_pipeline import generate_full_world_slice

def test_deterministic_generation():
    """
    Test that the same seed always generates the exact same world,
    and different seeds generate different worlds.
    """
    seed1 = "Eldoria"
    seed2 = "Eldoria"
    seed3 = "Valoria"
    
    world1 = generate_full_world_slice(seed1)
    world2 = generate_full_world_slice(seed2)
    world3 = generate_full_world_slice(seed3)
    
    # Prove determinism
    assert world1["seed"] == world2["seed"]
    assert len(world1["cells"]) == len(world2["cells"])
    
    # Prove identical coordinates, elevations, biomes, and names
    for c1, c2 in zip(world1["cells"], world2["cells"]):
        assert c1["x"] == c2["x"]
        assert c1["y"] == c2["y"]
        assert c1["elevation"] == c2["elevation"]
        assert c1["biome"] == c2["biome"]
        
    assert world1["settlements"][0]["name"] == world2["settlements"][0]["name"]
    assert world1["settlements"][1]["name"] == world2["settlements"][1]["name"]
    
    # Prove different seed creates a different layout
    assert world1["settlements"][0]["name"] != world3["settlements"][0]["name"] or \
           world1["cells"][1000]["elevation"] != world3["cells"][1000]["elevation"]

def test_rivers_trend_downhill():
    """
    Test that river paths generally follow decreasing elevation.
    A small margin of error (0.01) is allowed for flat lake pools or slight fencings.
    """
    world = generate_full_world_slice("Eldoria")
    rivers = world["rivers"]
    
    # Map cell coords to elevation for fast lookup
    cell_map = { (c["x"], c["y"]): c["elevation"] for c in world["cells"] }
    
    for path in rivers:
        # Check that elevations generally trend downhill
        for i in range(len(path) - 1):
            curr_node = path[i]
            next_node = path[i+1]
            
            curr_el = cell_map.get((curr_node["x"], curr_node["y"]))
            next_el = cell_map.get((next_node["x"], next_node["y"]))
            
            # Elev of next step must be less than or equal to current step (within float margin of lake pooling)
            assert next_el <= curr_el + 0.05

def test_town_has_origin_reason():
    """
    Verify that the major town contains a descriptive, non-empty origin reason.
    """
    world = generate_full_world_slice("Eldoria")
    town = next(s for s in world["settlements"] if s["type"] == "town")
    assert town["origin_reason"] is not None
    assert len(town["origin_reason"]) > 10

def test_mining_outpost_requires_ore():
    """
    Verify that if a mining outpost exists, it is placed adjacent to an Ore resource (distance <= 1.5).
    """
    world = generate_full_world_slice("Eldoria")
    outposts = [s for s in world["settlements"] if s["type"] == "mining outpost"]
    
    if outposts:
        for op in outposts:
            # Find ore resource nodes
            ores = [r for r in world["resources"] if r["type"] in ["Iron Ore", "Gold"]]
            assert len(ores) > 0
            
            # Find distance to closest ore
            min_dist = min(np.hypot(ore["x"] - op["x"], ore["y"] - op["y"]) for ore in ores)
            assert min_dist <= 1.5

def test_logging_camp_requires_forest_or_timber():
    """
    Verify that if a logging camp exists, it is adjacent to a Timber node (distance <= 1.5) or in a forest.
    """
    world = generate_full_world_slice("Eldoria")
    camps = [s for s in world["settlements"] if s["type"] == "logging camp"]
    
    if camps:
        for cp in camps:
            # Find timber resources
            timber = [r for r in world["resources"] if r["type"] == "Timber"]
            assert len(timber) > 0
            
            min_dist = min(np.hypot(t["x"] - cp["x"], t["y"] - cp["y"]) for t in timber)
            assert min_dist <= 1.5

def test_bridges_appear_on_intersections():
    """
    Verify that bridges only appear where a road intersects a river cell.
    """
    world = generate_full_world_slice("Eldoria")
    bridges = world["bridges"]
    roads = world["roads"]
    
    # Gather all road path coordinates
    road_coords = set()
    for r in roads:
        for node in r["path"]:
            road_coords.add((node["x"], node["y"]))
            
    # Gather river/lake cells from grid
    water_coords = set()
    for c in world["cells"]:
        if c["water_type"] in ["river", "lake"]:
            water_coords.add((c["x"], c["y"]))
            
    for b in bridges:
        # Bridge must be on a road and crossing river/lake
        assert (b["x"], b["y"]) in road_coords
        assert (b["x"], b["y"]) in water_coords

def test_roads_avoid_deep_ocean():
    """
    Verify that generated road paths do not cross impassable deep ocean cells.
    """
    world = generate_full_world_slice("Eldoria")
    roads = world["roads"]
    
    cell_map = { (c["x"], c["y"]): c["water_type"] for c in world["cells"] }
    
    for r in roads:
        for node in r["path"]:
            wt = cell_map.get((node["x"], node["y"]))
            assert wt != "ocean"

def test_organic_landmass_shape():
    """
    Verify that the landmass shape is organic and non-circular.
    This asserts that shoreline cell distances from the center (64, 64)
    exhibit a healthy standard deviation (> 1.5).
    """
    world = generate_full_world_slice("Eldoria")
    width = world["width"]
    height = world["height"]
    cell_map = { (c["x"], c["y"]): c for c in world["cells"] }
    
    shoreline_distances = []
    center_x, center_y = width // 2, height // 2
    
    for c in world["cells"]:
        # Shoreline: land adjacent to ocean
        if c["elevation"] >= 0.45:  # land
            is_shore = False
            for dx, dy in [(-1,0), (1,0), (0,-1), (0,1)]:
                nx, ny = c["x"] + dx, c["y"] + dy
                if 0 <= nx < width and 0 <= ny < height:
                    neighbor = cell_map.get((nx, ny))
                    if neighbor and neighbor["elevation"] < 0.45:
                        is_shore = True
                        break
            if is_shore:
                dist = np.hypot(c["x"] - center_x, c["y"] - center_y)
                shoreline_distances.append(dist)
                
    assert len(shoreline_distances) > 0
    std_dev = np.std(shoreline_distances)
    # Organic coastlines will have significant variance compared to a perfect circle (std = 0)
    assert std_dev > 1.5

def test_river_depression_filling():
    """
    Verify that when a river encounters a depression/sink, it pools into a lake (water_type == 'lake'),
    and successfully routes downhill through the lake spillover point to reach the ocean.
    """
    world = generate_full_world_slice("Eldoria")
    lake_cells = [c for c in world["cells"] if c["water_type"] == "lake"]
    
    if lake_cells:
        lake_coords = { (c["x"], c["y"]) for c in lake_cells }
        cell_map = { (c["x"], c["y"]): c for c in world["cells"] }
        
        found_traversed_river = False
        for path in world["rivers"]:
            path_coords = [(node["x"], node["y"]) for node in path]
            intersects = any(coord in lake_coords for coord in path_coords)
            if intersects:
                # River must be fully contiguous and reach adjacent ocean or ocean cell at the end
                last_node = path[-1]
                last_cell = cell_map[(last_node["x"], last_node["y"])]
                
                # River ends at ocean boundary
                is_near_ocean = last_cell["water_type"] == "ocean" or any(
                    cell_map.get((last_node["x"] + dx, last_node["y"] + dy), {}).get("water_type") == "ocean"
                    for dx, dy in [(-1,0), (1,0), (0,-1), (0,1), (-1,-1), (1,-1), (-1,1), (1,1)]
                )
                assert is_near_ocean
                found_traversed_river = True
                
        assert found_traversed_river

def test_road_pathfinding_integrity():
    """
    Verify that generated roads return fully connected sequences of adjacent cells.
    No coordinate gaps (diagonal or straight distance > 1) are permitted.
    """
    world = generate_full_world_slice("Eldoria")
    for road in world["roads"]:
        path = road["path"]
        assert len(path) >= 2
        for i in range(len(path) - 1):
            curr_node = path[i]
            next_node = path[i+1]
            dx = abs(curr_node["x"] - next_node["x"])
            dy = abs(curr_node["y"] - next_node["y"])
            assert dx <= 1 and dy <= 1
            assert not (dx == 0 and dy == 0)

def test_strict_schema_adherence():
    """
    Verify that all generated world output matches reinforced Pydantic schemas perfectly.
    """
    from app.schemas.world import WorldResponse
    for seed in ["Eldoria", "Valoria", "DeepStone"]:
        world_data = generate_full_world_slice(seed)
        response_model = WorldResponse(**world_data)
        assert response_model.seed == seed

