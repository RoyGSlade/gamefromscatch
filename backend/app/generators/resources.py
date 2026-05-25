import numpy as np
from typing import List, Dict, Tuple, Any
from .noise import seed_from_string

def generate_resources(
    width: int,
    height: int,
    biomes: np.ndarray,
    water_type: np.ndarray,
    seed_str: str
) -> Tuple[List[Dict[str, Any]], List[List[str]]]:
    """
    Deterministically places resources (Timber, Iron Ore, Gold, Fish) based on biome.
    Returns a flat list of resource overlays and a 2D grid containing lists of cell resource types.
    """
    rng = np.random.default_rng(seed_from_string(seed_str))
    
    resource_grid = [[[] for _ in range(width)] for _ in range(height)]
    resource_overlays = []
    
    # 1. Guarantee at least a few rich nodes so outposts always have valid targets
    # Gather candidates for Ore (Mountain/Hills) and Timber (Forest/Boreal)
    ore_candidates = []
    timber_candidates = []
    fish_candidates = []
    
    for y in range(height):
        for x in range(width):
            b = biomes[y, x]
            wt = water_type[y, x]
            
            if b in ["Craggy Peaks", "Rolling Hills"] and wt == "none":
                ore_candidates.append((x, y))
            elif b in ["Dense Forest", "Taiga / Boreal"] and wt == "none":
                timber_candidates.append((x, y))
            elif wt in ["ocean", "lake", "river"]:
                fish_candidates.append((x, y))
                
    # Place Ore (Iron Ore and Gold)
    # Shuffle candidates deterministically
    if ore_candidates:
        rng.shuffle(ore_candidates)
        # Place 4 to 8 Ore deposits
        num_ores = min(len(ore_candidates), rng.integers(6, 12))
        for i in range(num_ores):
            x, y = ore_candidates[i]
            r_type = "Gold" if rng.random() < 0.25 else "Iron Ore"
            resource_grid[y][x].append(r_type)
            resource_overlays.append({
                "id": f"res_ore_{i}_{x}_{y}",
                "x": x,
                "y": y,
                "type": r_type,
                "origin_reason": f"Rich subterranean veins of {r_type.lower()} formed in the craggy mountains."
            })
            
    # Place Timber
    if timber_candidates:
        rng.shuffle(timber_candidates)
        num_timber = min(len(timber_candidates), rng.integers(8, 15))
        for i in range(num_timber):
            x, y = timber_candidates[i]
            resource_grid[y][x].append("Timber")
            resource_overlays.append({
                "id": f"res_timber_{i}_{x}_{y}",
                "x": x,
                "y": y,
                "type": "Timber",
                "origin_reason": "Ancient old-growth groves containing highly valuable dense timber."
            })
            
    # Place Fish
    if fish_candidates:
        rng.shuffle(fish_candidates)
        num_fish = min(len(fish_candidates), rng.integers(6, 12))
        for i in range(num_fish):
            x, y = fish_candidates[i]
            resource_grid[y][x].append("Fish")
            resource_overlays.append({
                "id": f"res_fish_{i}_{x}_{y}",
                "x": x,
                "y": y,
                "type": "Fish",
                "origin_reason": "A spawning ground rich with native silver-scaled river trout."
            })
            
    return resource_overlays, resource_grid
