import numpy as np
from typing import List, Dict, Tuple, Any
from .noise import seed_from_string

LAND_PREFIXES = ['Eld', 'Val', 'Krag', 'Oakh', 'Storm', 'River', 'Deep', 'High', 'Stone', 'Gold', 'Iron', 'Sol', 'Wind', 'Dun', 'Glen', 'Roth', 'Bryn']
LAND_SUFFIXES = ['ia', 'hold', 'run', 'haven', 'fell', 'wood', 'gard', 'ford', 'wall', 'reach', 'shire', 'vale', 'port', 'bay', 'crest', 'keep', 'marsh']

# Settlement type tiers for road hierarchy determination
SETTLEMENT_TIERS = {
    "capital": 3,
    "town": 2,
    "mining outpost": 1,
    "logging camp": 1,
    "fishing village": 1,
    "outpost": 1,
}

def generate_deterministic_name(rng, settlement_type="town") -> str:
    pref = rng.choice(LAND_PREFIXES)
    suff = rng.choice(LAND_SUFFIXES)
    name = pref + suff
    if settlement_type in ("mining outpost",):
        post = rng.choice(["Camp", "Mines", "Quarry", "Station"])
        return f"{name} {post}"
    elif settlement_type in ("logging camp",):
        post = rng.choice(["Camp", "Lumberyard", "Outpost"])
        return f"{name} {post}"
    elif settlement_type in ("fishing village",):
        post = rng.choice(["Landing", "Cove", "Wharf"])
        return f"{name} {post}"
    elif settlement_type == "outpost":
        post = rng.choice(["Outpost", "Station", "Post"])
        return f"{name} {post}"
    return name


def _score_town_site(x, y, elevation, biomes, water_type, width, height):
    """Score a candidate town/capital site based on terrain desirability."""
    b = biomes[y, x]
    elev = elevation[y, x]
    
    if b not in ("Lush Plains", "Dense Forest") or water_type[y, x] != "none" or elev >= 0.6:
        return -1
    
    score = 0
    if b == "Lush Plains":
        score += 5
    
    # Prefer proximity to freshwater
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            ny, nx = y + dy, x + dx
            if 0 <= ny < height and 0 <= nx < width:
                if water_type[ny, nx] in ("river", "lake", "ocean"):
                    score += 10
                    break
        else:
            continue
        break
    
    return score


def _min_dist_to_settlements(x, y, placed):
    """Compute minimum distance from (x,y) to any already-placed settlement."""
    if not placed:
        return float("inf")
    return min(np.hypot(x - s["x"], y - s["y"]) for s in placed)


def place_settlements(
    width: int,
    height: int,
    elevation: np.ndarray,
    biomes: np.ndarray,
    water_type: np.ndarray,
    resources: List[Dict[str, Any]],
    seed_str: str
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Deterministically places multiple settlements:
    - 1 Capital (population 4000-8000)
    - 1-2 Towns (population 1500-4000)
    - 2-4 Resource Outposts (population 100-400, adjacent to resource nodes)
    
    Returns (settlements_list, settlements_list) — the second copy kept for
    backward-compatible tuple unpacking. All settlements are in the first list.
    """
    rng = np.random.default_rng(seed_from_string(seed_str))
    
    placed = []
    
    # -------------------------------------------------------
    # 1. Place the Capital
    # -------------------------------------------------------
    capital_candidates = []
    for y in range(5, height - 5):
        for x in range(5, width - 5):
            score = _score_town_site(x, y, elevation, biomes, water_type, width, height)
            if score >= 0:
                capital_candidates.append((score, x, y))
    
    capital_candidates.sort(key=lambda t: t[0], reverse=True)
    
    if capital_candidates:
        _, tx, ty = capital_candidates[0]
    else:
        tx, ty = width // 2, height // 2
    
    capital = {
        "id": "capital_01",
        "name": generate_deterministic_name(rng, "capital"),
        "x": tx,
        "y": ty,
        "type": "capital",
        "origin_reason": "Founded at the strategic confluence of major waterways, commanding fertile plains and vital trade routes across the region.",
        "population": int(rng.integers(4000, 8001)),
        "resources": ["Grain", "Spices", "Wool", "Leather"],
        "ruler": f"High Sovereign {rng.choice(LAND_PREFIXES)}{rng.choice(LAND_SUFFIXES)}",
        "lore": "The ancient seat of regional power, its stone walls have weathered centuries of war and prosperity alike.",
    }
    placed.append(capital)
    
    # -------------------------------------------------------
    # 2. Place 1-2 Towns
    # -------------------------------------------------------
    num_towns = int(rng.integers(1, 3))
    
    for t_idx in range(num_towns):
        town_candidates = []
        for y in range(5, height - 5):
            for x in range(5, width - 5):
                score = _score_town_site(x, y, elevation, biomes, water_type, width, height)
                if score < 0:
                    continue
                dist = _min_dist_to_settlements(x, y, placed)
                if dist < 20:
                    continue
                # Bonus for being far from existing settlements (spread out)
                score += min(dist * 0.3, 15)
                town_candidates.append((score, x, y))
        
        town_candidates.sort(key=lambda t: t[0], reverse=True)
        
        if town_candidates:
            _, ttx, tty = town_candidates[0]
        else:
            # Fallback: pick a spot at offset from capital
            ttx = min(width - 6, tx + 30 + t_idx * 15)
            tty = min(height - 6, ty + 10 + t_idx * 10)
        
        # Check if this town is coastal (adjacent to ocean)
        is_coastal = False
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                ny, nx = tty + dy, ttx + dx
                if 0 <= ny < height and 0 <= nx < width:
                    if water_type[ny, nx] == "ocean":
                        is_coastal = True
                        break
            if is_coastal:
                break
        
        town_resources = ["Grain", "Wool"]
        if is_coastal:
            town_resources.append("Salt")
        
        town = {
            "id": f"town_{t_idx + 1:02d}",
            "name": generate_deterministic_name(rng, "town"),
            "x": ttx,
            "y": tty,
            "type": "town",
            "origin_reason": f"Established along fertile margins of the local water system, providing rich arable land and freshwater routing.",
            "population": int(rng.integers(1500, 4001)),
            "resources": town_resources,
            "ruler": f"Margrave {rng.choice(LAND_PREFIXES)}{rng.choice(LAND_SUFFIXES)}",
            "lore": "A thriving market town known for its bustling trade square and strong militia.",
            "isCoastal": is_coastal,
        }
        placed.append(town)
    
    # -------------------------------------------------------
    # 3. Place 2-4 Resource Outposts
    # -------------------------------------------------------
    num_outposts = int(rng.integers(2, 5))
    
    # Categorize resources for outpost targeting
    land_resources = [r for r in resources if r["type"] in (
        "Iron Ore", "Copper", "Coal", "Gold", "Silver",
        "Mithril", "Arcane Crystals", "Timber",
        "Swamp Herbs", "Toxic Mosses", "Oasis Botanicals",
    )]
    fish_resources = [r for r in resources if r["type"] == "Fish"]
    
    # Sort land resources by distance from capital (farthest first for spread)
    land_resources.sort(
        key=lambda r: np.hypot(r["x"] - tx, r["y"] - ty),
        reverse=True
    )
    
    used_resource_ids = set()
    
    for op_idx in range(num_outposts):
        outpost = None
        
        # Try to place near a land resource
        for r in land_resources:
            if r["id"] in used_resource_ids:
                continue
            
            rx, ry = r["x"], r["y"]
            dist = _min_dist_to_settlements(rx, ry, placed)
            if dist < 15:
                continue
            
            r_type = r["type"]
            
            # Find an adjacent empty land cell for the outpost
            for ddx, ddy in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1)]:
                ox, oy = rx + ddx, ry + ddy
                if 0 <= ox < width and 0 <= oy < height:
                    if elevation[oy, ox] >= 0.45 and water_type[oy, ox] == "none":
                        used_resource_ids.add(r["id"])
                        
                        if r_type in ("Iron Ore", "Gold", "Silver", "Copper", "Coal"):
                            outpost_type = "mining outpost"
                            origin_reason = f"Established adjacent to high-yield {r_type.lower()} deposits discovered in the crags."
                            trade_goods = [r_type, "Stone"]
                        elif r_type == "Timber":
                            outpost_type = "logging camp"
                            origin_reason = "Constructed at the frontier of high-canopy woodlands to harvest ancient prime timber."
                            trade_goods = ["Timber", "Resin"]
                        elif r_type == "Mithril":
                            outpost_type = "mining outpost"
                            origin_reason = "A heavily guarded excavation site surrounding an extremely rare mithril seam."
                            trade_goods = ["Mithril"]
                        elif r_type == "Arcane Crystals":
                            outpost_type = "mining outpost"
                            origin_reason = "A specialized extraction camp carefully harvesting volatile arcane crystal formations."
                            trade_goods = ["Arcane Crystals"]
                        elif r_type in ("Swamp Herbs", "Toxic Mosses"):
                            outpost_type = "outpost"
                            origin_reason = f"A foraging station gathering rare {r_type.lower()} from the surrounding wetlands."
                            trade_goods = [r_type]
                        elif r_type == "Oasis Botanicals":
                            outpost_type = "outpost"
                            origin_reason = "A desert botanical station tending a hidden oasis spring and its unique flora."
                            trade_goods = ["Oasis Botanicals", "Fresh Water"]
                        else:
                            outpost_type = "outpost"
                            origin_reason = f"Pioneered to exploit local harvests of {r_type.lower()}."
                            trade_goods = [r_type]
                        
                        outpost = {
                            "id": f"outpost_{op_idx + 1:02d}",
                            "name": generate_deterministic_name(rng, outpost_type),
                            "x": ox,
                            "y": oy,
                            "type": outpost_type,
                            "origin_reason": origin_reason,
                            "population": int(rng.integers(100, 401)),
                            "resources": trade_goods,
                            "ruler": f"Overseer {rng.choice(LAND_PREFIXES)}{rng.choice(LAND_SUFFIXES)}",
                            "lore": "A vital industrial outpost feeding essential raw materials to the regional economy.",
                        }
                        break
                if outpost:
                    break
            if outpost:
                break
        
        # Fallback: try placing a fishing village near water
        if outpost is None and fish_resources:
            for r in fish_resources:
                if r["id"] in used_resource_ids:
                    continue
                rx, ry = r["x"], r["y"]
                dist = _min_dist_to_settlements(rx, ry, placed)
                if dist < 15:
                    continue
                
                # Find adjacent land cell
                for ddx, ddy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    ox, oy = rx + ddx, ry + ddy
                    if 0 <= ox < width and 0 <= oy < height:
                        if elevation[oy, ox] >= 0.45 and water_type[oy, ox] == "none":
                            used_resource_ids.add(r["id"])
                            outpost = {
                                "id": f"outpost_{op_idx + 1:02d}",
                                "name": generate_deterministic_name(rng, "fishing village"),
                                "x": ox,
                                "y": oy,
                                "type": "fishing village",
                                "origin_reason": "A quiet waterside hamlet sustained by the rich fishing grounds of the adjacent waters.",
                                "population": int(rng.integers(80, 250)),
                                "resources": ["Fish", "Salt"],
                                "ruler": f"Elder {rng.choice(LAND_PREFIXES)}{rng.choice(LAND_SUFFIXES)}",
                                "lore": "Weathered fisherfolk mend nets at dawn, their catches feeding settlements across the region.",
                            }
                            break
                if outpost:
                    break
        
        # Final fallback
        if outpost is None:
            fx = min(width - 6, tx + 25 + op_idx * 12)
            fy = min(height - 6, ty + 15 + op_idx * 8)
            outpost = {
                "id": f"outpost_{op_idx + 1:02d}",
                "name": generate_deterministic_name(rng, "outpost"),
                "x": fx,
                "y": fy,
                "type": "outpost",
                "origin_reason": "Pioneered as a frontier outpost to extend regional influence.",
                "population": int(rng.integers(80, 200)),
                "resources": ["Timber"],
                "ruler": f"Overseer {rng.choice(LAND_PREFIXES)}{rng.choice(LAND_SUFFIXES)}",
                "lore": "A quiet outpost nestled at the edge of explored territory.",
            }
        
        placed.append(outpost)
    
    return placed, placed
