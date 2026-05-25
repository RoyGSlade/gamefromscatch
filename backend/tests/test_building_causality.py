import pytest
import numpy as np
from app.generators.world_pipeline import generate_full_world_slice

def test_sawmill_proximity_and_causality():
    """
    Assert that a Sawmill only spawns when the settlement has both Timber
    resources and a river flowing in its immediate vicinity.
    """
    world = generate_full_world_slice("Eldoria")
    layouts = world["settlement_layouts"]
    
    # Map coordinates to water type
    water_map = { (c["x"], c["y"]): c["water_type"] for c in world["cells"] }
    
    for layout in layouts:
        settlement = next(s for s in world["settlements"] if s["id"] == layout["settlement_id"])
        sawmills = [b for b in layout["buildings"] if b["type"] == "sawmill"]
        
        if sawmills:
            # Must have Timber resource
            assert "Timber" in settlement["resources"]
            
            # Must be adjacent to a river cell
            for sm in sawmills:
                bx, by = sm["x"], sm["y"]
                bw, bh = sm["width"], sm["height"]
                
                touches_river = False
                for y in range(by, by + bh):
                    for x in range(bx, bx + bw):
                        if water_map.get((x, y)) == "river":
                            touches_river = True
                            break
                    if touches_river:
                        break
                        
                assert touches_river, "Sawmill must touch a river boundary cell"

def test_dockyard_coastal_proximity():
    """
    Assert that Docks only spawn when adjacent to navigable coastal water (ocean or lake).
    """
    world = generate_full_world_slice("Eldoria")
    layouts = world["settlement_layouts"]
    
    water_map = { (c["x"], c["y"]): c["water_type"] for c in world["cells"] }
    
    for layout in layouts:
        docks = [b for b in layout["buildings"] if b["type"] == "docks"]
        
        if docks:
            for dk in docks:
                bx, by = dk["x"], dk["y"]
                bw, bh = dk["width"], dk["height"]
                
                touches_coastal = False
                for y in range(by, by + bh):
                    for x in range(bx, bx + bw):
                        wt = water_map.get((x, y))
                        if wt in ["ocean", "lake"]:
                            touches_coastal = True
                            break
                    if touches_coastal:
                        break
                        
                assert touches_coastal, "Docks building must overlap coastal water body (ocean/lake)"

def test_mining_outpost_resource_causality():
    """
    Assert that Mining Office or Mine Entrance only appears when valid ore resources
    are present in the settlement resource profiles.
    """
    world = generate_full_world_slice("Eldoria")
    layouts = world["settlement_layouts"]
    
    mineable_resources = {"Iron Ore", "Gold", "Copper", "Coal", "Silver", "Mithril", "Arcane Crystals"}
    
    for layout in layouts:
        settlement = next(s for s in world["settlements"] if s["id"] == layout["settlement_id"])
        mine_buildings = [b for b in layout["buildings"] if b["type"] in ["mine_entrance", "mining_office"]]
        
        if mine_buildings:
            has_ore = bool(set(settlement["resources"]) & mineable_resources)
            assert has_ore, "Mine buildings can only spawn in settlements with mineable ore resources"

def test_job_and_chain_id_validation():
    """
    Assert that all generated job slots and production chain processor elements
    perfectly reference valid building IDs inside their respective settlement layout.
    """
    world = generate_full_world_slice("Eldoria")
    layouts = world["settlement_layouts"]
    
    for layout in layouts:
        placed_building_ids = { b["id"] for b in layout["buildings"] }
        
        # Verify job slot references
        for job in layout["job_slots"]:
            assert job["building_id"] in placed_building_ids, f"Job slot {job['id']} references missing building {job['building_id']}"
            
        # Verify production chain references
        for chain in layout["production_chains"]:
            for b_id in chain["buildings_involved"]:
                assert b_id in placed_building_ids, f"Production chain {chain['id']} references missing building {b_id}"
