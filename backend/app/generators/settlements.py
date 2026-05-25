import numpy as np
from typing import List, Dict, Tuple, Any
from .noise import seed_from_string

LAND_PREFIXES = ['Eld', 'Val', 'Krag', 'Oakh', 'Storm', 'River', 'Deep', 'High', 'Stone', 'Gold', 'Iron', 'Sol', 'Wind', 'Dun', 'Glen', 'Roth', 'Bryn']
LAND_SUFFIXES = ['ia', 'hold', 'run', 'haven', 'fell', 'wood', 'gard', 'ford', 'wall', 'reach', 'shire', 'vale', 'port', 'bay', 'crest', 'keep', 'marsh']

def generate_deterministic_name(rng, is_town=True) -> str:
    pref = rng.choice(LAND_PREFIXES)
    suff = rng.choice(LAND_SUFFIXES)
    name = pref + suff
    if not is_town:
        post = rng.choice(["Camp", "Outpost", "Mines", "Lumberyard", "Station"])
        return f"{name} {post}"
    return name

def place_settlements(
    width: int,
    height: int,
    elevation: np.ndarray,
    biomes: np.ndarray,
    water_type: np.ndarray,
    resources: List[Dict[str, Any]],
    seed_str: str
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], Dict[str, Any]]:
    """
    Deterministically places exactly one major Town and one Resource Outpost.
    Town is placed near freshwater (river/lake) in a flat plain/forest.
    Outpost is placed adjacent to a resource node (e.g., Ore or Timber).
    """
    rng = np.random.default_rng(seed_from_string(seed_str))
    
    # 1. Place the Town
    town_candidates = []
    for y in range(5, height - 5):
        for x in range(5, width - 5):
            b = biomes[y, x]
            wt = water_type[y, x]
            elev = elevation[y, x]
            
            # Town needs to be on flat land (elevation < 0.6) and Plains/Forest
            if b in ["Lush Plains", "Dense Forest"] and wt == "none" and elev < 0.6:
                # Prefer proximity to freshwater (river or lake) or ocean harbor
                is_near_water = False
                for dy in [-1, 0, 1]:
                    for dx in [-1, 0, 1]:
                        ny, nx = y + dy, x + dx
                        if water_type[ny, nx] in ["river", "lake", "ocean"]:
                            is_near_water = True
                
                score = 10 if is_near_water else 0
                if b == "Lush Plains":
                    score += 5
                
                town_candidates.append((score, x, y))
                
    # Sort candidates by score descending
    town_candidates.sort(key=lambda t: t[0], reverse=True)
    
    if town_candidates:
        # Take the top candidate, or deterministic index based on seed
        _, tx, ty = town_candidates[0]
    else:
        # Fallback to map center
        tx, ty = width // 2, height // 2
        
    town_name = generate_deterministic_name(rng, is_town=True)
    town_origin_reason = f"Founded along the fertile margins of the local water system, providing rich arable land and freshwater routing."
    
    town = {
        "id": "town_01",
        "name": town_name,
        "x": tx,
        "y": ty,
        "type": "town",
        "origin_reason": town_origin_reason,
        "population": int(rng.integers(2500, 5000)),
        "resources": ["Grain", "Spices", "Wool"],
        "ruler": f"Margrave {rng.choice(LAND_PREFIXES)}{rng.choice(LAND_SUFFIXES)}",
        "lore": f"The historical capital of this region, renowned for its river trade and defensible hillside outlook."
    }
    
    # 2. Place the Resource Outpost
    # We want it to be at least 25 cells away from the Town to make road building interesting
    outpost_placed = False
    outpost = None
    
    # Find resources that are far enough and are land-based (Iron Ore, Gold, Timber)
    distant_resources = []
    for r in resources:
        if r["type"] in ["Iron Ore", "Gold", "Timber"]:
            dist = np.hypot(r["x"] - tx, r["y"] - ty)
            if dist >= 25:
                distant_resources.append(r)
            
    # If no distant resource exists, relax distance constraint
    if not distant_resources:
        distant_resources = [r for r in resources if r["type"] in ["Iron Ore", "Gold", "Timber"]]
        
    # We want a Mining Outpost if near Ore, or Logging Camp if near Timber
    if distant_resources:
        # Select one deterministically
        target_res = distant_resources[rng.integers(0, len(distant_resources))]
        rx, ry = target_res["x"], target_res["y"]
        r_type = target_res["type"]
        
        # Place outpost in an adjacent empty land cell
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1)]:
            ox, oy = rx + dx, ry + dy
            if 0 <= ox < width and 0 <= oy < height:
                if elevation[oy, ox] >= 0.45 and water_type[oy, ox] == "none" and (ox != tx or oy != ty):
                    outpost_name = generate_deterministic_name(rng, is_town=False)
                    
                    if r_type in ["Iron Ore", "Gold"]:
                        outpost_type = "mining outpost"
                        origin_reason = f"Established immediately adjacent to high-yield {r_type.lower()} veins discovered in the crags."
                        trade_goods = [r_type, "Stone"]
                    elif r_type == "Timber":
                        outpost_type = "logging camp"
                        origin_reason = "Constructed at the frontier of the high-canopy woodlands to harvest ancient prime timber."
                        trade_goods = ["Timber", "Resin"]
                    else:
                        outpost_type = "outpost"
                        origin_reason = f"Pioneered to exploit local harvests of {r_type.lower()}."
                        trade_goods = [r_type]
                        
                    outpost = {
                        "id": "outpost_01",
                        "name": outpost_name,
                        "x": ox,
                        "y": oy,
                        "type": outpost_type,
                        "origin_reason": origin_reason,
                        "population": int(rng.integers(120, 280)),
                        "resources": trade_goods,
                        "ruler": f"Overseer {rng.choice(LAND_PREFIXES)}{rng.choice(LAND_SUFFIXES)}",
                        "lore": f"A vital industrial outpost that feeds essential raw materials back to the capital town."
                    }
                    outpost_placed = True
                    break
                    
    # Fallback if no outpost placed
    if not outpost_placed:
        # Place at some distance
        ox, oy = tx + 30, ty + 10
        outpost = {
            "id": "outpost_01",
            "name": "Outland Station",
            "x": ox,
            "y": oy,
            "type": "logging camp",
            "origin_reason": "Pioneered as a frontier logging post to source timber from the surrounding dense forest.",
            "population": 150,
            "resources": ["Timber"],
            "ruler": "Overseer Bryn",
            "lore": "A quiet outpost nestled deep in the woodlands."
        }
        
    return [town, outpost], town, outpost
