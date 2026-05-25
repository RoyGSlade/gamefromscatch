import numpy as np
import heapq
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
        path = [{"x": int(sx), "y": int(sy)}]
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
                    path.append({"x": int(nx), "y": int(ny)})
                    break
                
                # Flow downhill
                cx, cy = nx, ny
                path.append({"x": int(cx), "y": int(cy)})
                visited.add((cx, cy))
            else:
                # We hit a local minimum / sink. Let's pool/flood until we spill over!
                pooled = True
                basin = { (cx, cy) }
                boundary_pq = []
                queued = set()
                
                for dx, dy in neighbors_offsets:
                    nbx, nby = cx + dx, cy + dy
                    if 0 <= nbx < width and 0 <= nby < height:
                        if (nbx, nby) not in basin:
                            heapq.heappush(boundary_pq, (elevation[nby, nbx], nbx, nby))
                            queued.add((nbx, nby))
                
                spillover = None
                lake_level = elevation[cy, cx]
                
                while boundary_pq:
                    elev_b, bx, by = heapq.heappop(boundary_pq)
                    lake_level = max(lake_level, elev_b)
                    
                    # Check if this boundary cell can spill to an unvisited cell lower than lake_level
                    is_spill = False
                    for dx, dy in neighbors_offsets:
                        sx_nb, sy_nb = bx + dx, by + dy
                        if 0 <= sx_nb < width and 0 <= sy_nb < height:
                            if (sx_nb, sy_nb) not in basin:
                                if elevation[sy_nb, sx_nb] < lake_level or water_type[sy_nb, sx_nb] == "ocean":
                                    is_spill = True
                                    break
                                    
                    if is_spill:
                        spillover = (bx, by)
                        break
                        
                    # Add to basin
                    basin.add((bx, by))
                    
                    # Push neighbors of this cell to boundary
                    for dx, dy in neighbors_offsets:
                        nbx, nby = bx + dx, by + dy
                        if 0 <= nbx < width and 0 <= nby < height:
                            if (nbx, nby) not in basin and (nbx, nby) not in queued:
                                heapq.heappush(boundary_pq, (elevation[nby, nbx], nbx, nby))
                                queued.add((nbx, nby))
                                
                    if len(basin) > 30:
                        break
                        
                if spillover:
                    # Fill the basin with lake water
                    for lx, ly in basin:
                        water_type[ly, lx] = "lake"
                        
                    # Run BFS within the basin to find a contiguous path of adjacent cells
                    # from the current sink (cx, cy) to the spillover point (bx, by).
                    start_node = (cx, cy)
                    end_node = spillover
                    
                    queue = [[start_node]]
                    bfs_visited = {start_node}
                    bfs_path = []
                    
                    end_x, end_y = end_node
                    end_adjacent_in_basin = []
                    for dx, dy in neighbors_offsets:
                        ax, ay = end_x + dx, end_y + dy
                        if (ax, ay) in basin:
                            end_adjacent_in_basin.append((ax, ay))
                            
                    if start_node in end_adjacent_in_basin:
                        bfs_path = [start_node, end_node]
                    else:
                        found_path = False
                        while queue:
                            curr_path = queue.pop(0)
                            curr_cell = curr_path[-1]
                            
                            if curr_cell in end_adjacent_in_basin:
                                bfs_path = curr_path + [end_node]
                                found_path = True
                                break
                                
                            for dx, dy in neighbors_offsets:
                                nx, ny = curr_cell[0] + dx, curr_cell[1] + dy
                                if (nx, ny) in basin and (nx, ny) not in bfs_visited:
                                    bfs_visited.add((nx, ny))
                                    queue.append(curr_path + [(nx, ny)])
                                    
                        if not found_path:
                            bfs_path = [end_node]
                            
                    # Add all steps of the BFS path to the river path (except the start node, which is already in path)
                    for step in bfs_path[1:]:
                        px, py = step
                        path.append({"x": int(px), "y": int(py)})
                        visited.add((px, py))
                        
                    # Reroute river downhill from the spillover cell
                    cx, cy = spillover
                    if water_type[cy, cx] == "ocean":
                        break
                else:
                    # Fallback: fill the basin and terminate river routing
                    for lx, ly in basin:
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
