import numpy as np
from typing import List, Dict, Tuple, Set
from .noise import seed_from_string

def generate_rivers(
    width: int,
    height: int,
    elevation: np.ndarray,
    biomes: np.ndarray,
    sea_level: float,
    seed_str: str
) -> Tuple[List[List[Dict[str, int]]], np.ndarray, np.ndarray]:
    """
    Generates deterministic downhill rivers starting from mountain peaks.
    If a river hits a local minimum, it pools into a lake.
    """
    rng = np.random.default_rng(seed_from_string(seed_str))
    
    # Initialize river-related grids
    water_type = np.empty((height, width), dtype=object)
    for y in range(height):
        for x in range(width):
            if elevation[y, x] < sea_level:
                water_type[y, x] = "ocean"
            else:
                water_type[y, x] = "none"
                
    river_flow = np.zeros((height, width), dtype=float)
    
    # 1. Identify mountain peak cells (elevation > 0.65)
    candidates = []
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            if elevation[y, x] > 0.65 and water_type[y, x] == "none":
                # Check if it is a local maximum or close to it
                val = elevation[y, x]
                is_peak = True
                for dy in [-1, 0, 1]:
                    for dx in [-1, 0, 1]:
                        if (dx != 0 or dy != 0) and elevation[y + dy, x + dx] > val:
                            is_peak = False
                if is_peak:
                    candidates.append((val, x, y))
                    
    # Sort candidates by elevation descending
    candidates.sort(key=lambda t: t[0], reverse=True)
    
    # We must have at least one river starting from the highest peak
    river_sources = []
    if candidates:
        river_sources.append((candidates[0][1], candidates[0][2]))
        # Deterministically select up to 2 more sources spaced apart
        for _, cx, cy in candidates[1:]:
            if len(river_sources) >= 3:
                break
            # Check distance to existing sources
            too_close = False
            for sx, sy in river_sources:
                if np.hypot(cx - sx, cy - sy) < 25:
                    too_close = True
            if not too_close:
                river_sources.append((cx, cy))
    else:
        # Fallback: Find highest point on the map
        max_idx = np.unravel_index(np.argmax(elevation), elevation.shape)
        river_sources.append((max_idx[1], max_idx[0]))
        
    river_paths = []
    
    # 8 neighbor offsets
    neighbors_offsets = [
        (-1, 0), (1, 0), (0, -1), (0, 1),
        (-1, -1), (1, -1), (-1, 1), (1, 1)
    ]
    
    for r_idx, (sx, sy) in enumerate(river_sources):
        path = [{"x": sx, "y": sy}]
        visited = { (sx, sy) }
        cx, cy = sx, sy
        pooled = False
        
        while True:
            # Look at neighbors
            candidates_next = []
            for dx, dy in neighbors_offsets:
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < width and 0 <= ny < height:
                    if (nx, ny) not in visited:
                        candidates_next.append((elevation[ny, nx], nx, ny))
            
            if not candidates_next:
                # No unvisited neighbors, terminate
                break
                
            # Find neighbor with lowest elevation
            candidates_next.sort(key=lambda t: t[0])
            lowest_elev, nx, ny = candidates_next[0]
            
            # Check if it goes downhill
            if lowest_elev < elevation[cy, cx]:
                # If we hit ocean, terminate river at the boundary
                if water_type[ny, nx] == "ocean":
                    path.append({"x": nx, "y": ny})
                    break
                
                # Flow downhill
                cx, cy = nx, ny
                path.append({"x": cx, "y": cy})
                visited.add((cx, cy))
            else:
                # We hit a local minimum / sink. Let's pool into a lake!
                pooled = True
                # Pool current cell and its immediate land neighbors
                water_type[cy, cx] = "lake"
                for dx, dy in neighbors_offsets:
                    lx, ly = cx + dx, cy + dy
                    if 0 <= lx < width and 0 <= ly < height:
                        if water_type[ly, lx] == "none":
                            water_type[ly, lx] = "lake"
                break
                
        # Only record if the path is reasonably long or pooled
        if len(path) >= 4 or pooled:
            river_paths.append(path)
            # Apply river marker to cells and compute flow
            for step_idx, node in enumerate(path):
                px, py = node["x"], node["y"]
                if water_type[py, px] == "none":
                    water_type[py, px] = "river"
                # Flow accumulates downstream
                river_flow[py, px] = max(river_flow[py, px], step_idx + 1.0)
                
    return river_paths, water_type, river_flow
