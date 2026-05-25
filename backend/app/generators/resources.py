import numpy as np
from typing import List, Dict, Tuple, Any
from .noise import seed_from_string

# Resource taxonomy: type -> (category, biome constraints, rarity weight)
RESOURCE_TAXONOMY = {
    # Industrial Ore
    "Iron Ore":          ("industrial_ore", ["Craggy Peaks", "Rolling Hills"], 1.0),
    "Copper":            ("industrial_ore", ["Rolling Hills", "Lush Plains"], 0.8),
    "Coal":              ("industrial_ore", ["Rolling Hills", "Dense Forest"], 0.7),
    # Precious
    "Gold":              ("precious", ["Craggy Peaks"], 0.25),
    "Silver":            ("precious", ["Craggy Peaks", "Rolling Hills"], 0.35),
    # Arcane
    "Mithril":           ("arcane", ["Frozen Peaks"], 0.10),
    "Arcane Crystals":   ("arcane", ["Craggy Peaks", "Frozen Peaks"], 0.12),
    # Botanical
    "Timber":            ("botanical", ["Dense Forest", "Taiga / Boreal"], 1.0),
    "Swamp Herbs":       ("botanical", ["Murky Swamp"], 0.6),
    "Toxic Mosses":      ("botanical", ["Murky Swamp"], 0.20),
    "Oasis Botanicals":  ("botanical", ["Arid Desert"], 0.15),
    # Aquatic
    "Fish":              ("aquatic", [], 1.0),  # special: uses water_type instead of biome
}

ORIGIN_REASONS = {
    "Iron Ore": "Rich subterranean veins of iron ore formed in the craggy mountains.",
    "Copper": "Shallow copper deposits exposed by centuries of erosion in the rolling terrain.",
    "Coal": "Compressed ancient peat layers yielding seams of combustible coal.",
    "Gold": "A glittering alluvial deposit of gold dust and nuggets trapped in mountain crevices.",
    "Silver": "Thin silver veins running through quartz-rich rock formations.",
    "Mithril": "An extraordinarily rare vein of mythical mithril, glowing faintly beneath the frozen stone.",
    "Arcane Crystals": "Clusters of resonating arcane crystals humming with latent magical energy.",
    "Timber": "Ancient old-growth groves containing highly valuable dense timber.",
    "Swamp Herbs": "A rare patch of medicinal swamp herbs prized by apothecaries.",
    "Toxic Mosses": "A dangerous bloom of toxic luminescent moss growing on submerged deadwood.",
    "Oasis Botanicals": "Desert-adapted flowering plants found near a hidden underground aquifer.",
    "Fish": "A spawning ground rich with native silver-scaled river trout.",
}


def generate_resources(
    width: int,
    height: int,
    biomes: np.ndarray,
    water_type: np.ndarray,
    seed_str: str
) -> Tuple[List[Dict[str, Any]], List[List[str]]]:
    """
    Deterministically places resources across 12 types based on biome constraints and rarity.
    Returns a flat list of resource overlays and a 2D grid containing lists of cell resource types.
    """
    rng = np.random.default_rng(seed_from_string(seed_str))
    
    resource_grid = [[[] for _ in range(width)] for _ in range(height)]
    resource_overlays = []
    
    # Build candidate maps per biome and water type
    biome_candidates = {}  # biome_name -> list of (x, y)
    water_candidates = []  # list of (x, y) for fish
    
    for y in range(height):
        for x in range(width):
            b = biomes[y, x]
            wt = water_type[y, x]
            
            if wt in ("ocean", "lake", "river"):
                water_candidates.append((x, y))
            
            if wt == "none":
                if b not in biome_candidates:
                    biome_candidates[b] = []
                biome_candidates[b].append((x, y))
    
    res_counter = {}  # type -> count for unique IDs
    
    for res_type, (category, biome_list, rarity_weight) in RESOURCE_TAXONOMY.items():
        res_counter[res_type] = 0
        
        if res_type == "Fish":
            # Fish uses water candidates
            candidates = list(water_candidates)
        elif res_type == "Oasis Botanicals":
            # Oasis botanicals: must be in Arid Desert AND near water
            raw = biome_candidates.get("Arid Desert", [])
            candidates = []
            for x, y in raw:
                near_water = False
                for dy in range(-2, 3):
                    for dx in range(-2, 3):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < height and 0 <= nx < width:
                            if water_type[ny, nx] in ("river", "lake"):
                                near_water = True
                                break
                    if near_water:
                        break
                if near_water:
                    candidates.append((x, y))
        else:
            # Standard biome-constrained resources
            candidates = []
            for biome_name in biome_list:
                candidates.extend(biome_candidates.get(biome_name, []))
        
        if not candidates:
            continue
        
        rng.shuffle(candidates)
        
        # Number of deposits scales with rarity and available candidates
        base_count = max(2, int(len(candidates) * 0.02 * rarity_weight))
        num_deposits = min(len(candidates), rng.integers(base_count, max(base_count + 1, base_count * 2 + 1)))
        
        for i in range(num_deposits):
            x, y = candidates[i]
            res_counter[res_type] += 1
            idx = res_counter[res_type]
            
            resource_grid[y][x].append(res_type)
            resource_overlays.append({
                "id": f"res_{res_type.lower().replace(' ', '_')}_{idx}_{x}_{y}",
                "x": x,
                "y": y,
                "type": res_type,
                "category": category,
                "origin_reason": ORIGIN_REASONS[res_type],
            })
    
    return resource_overlays, resource_grid
