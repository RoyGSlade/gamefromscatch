import heapq
import numpy as np
from typing import List, Dict, Tuple, Any
from .noise import seed_from_string

def get_travel_cost(
    fx: int, fy: int, tx: int, ty: int,
    elevation: np.ndarray,
    biomes: np.ndarray,
    water_type: np.ndarray
) -> float:
    """
    Calculates A* movement cost to go from cell (fx, fy) to (tx, ty).
    Deep water is impassable. Steeper slopes, rivers, and mountains increase cost.
    """
    b = biomes[ty, tx]
    wt = water_type[ty, tx]
    elev_to = elevation[ty, tx]
    elev_from = elevation[fy, fx]
    
    # 1. Base terrain cost
    if b == "Deep Ocean":
        return 9999.0  # impassable
    elif b == "Shallow Ocean":
        return 500.0   # extremely costly, try to avoid
    elif b in ["Frozen Peaks", "Craggy Peaks"]:
        base = 25.0    # high mountains, very costly
    elif b == "Rolling Hills":
        base = 5.0
    elif b == "Murky Swamp":
        base = 8.0
    elif b == "Dense Forest":
        base = 3.0
    else:
        base = 1.0     # plains, beach, desert
        
    # 2. Slope penalty
    slope = abs(elev_to - elev_from) * 45.0
    
    # 3. River crossing penalty (simulates bridge requirement)
    river_penalty = 0.0
    if wt == "river":
        river_penalty = 12.0
    elif wt == "lake":
        river_penalty = 40.0
        
    return base + slope + river_penalty

def astar(
    width: int,
    height: int,
    start: Tuple[int, int],
    end: Tuple[int, int],
    elevation: np.ndarray,
    biomes: np.ndarray,
    water_type: np.ndarray
) -> List[Dict[str, int]]:
    """
    Standard A* algorithm to find a deterministic path between two points.
    """
    sx, sy = start
    ex, ey = end
    
    # Priority queue holds (f_score, x, y)
    pq = []
    heapq.heappush(pq, (0.0, sx, sy))
    
    # G scores map (x, y) to cost
    g_score = { (sx, sy): 0.0 }
    
    # Parent pointers for backtracking
    parents = {}
    
    # 8-directional neighbors
    neighbors = [
        (-1, 0), (1, 0), (0, -1), (0, 1),
        (-1, -1), (1, -1), (-1, 1), (1, 1)
    ]
    
    while pq:
        _, cx, cy = heapq.heappop(pq)
        
        if cx == ex and cy == ey:
            # Reconstruct path
            path = []
            curr = (ex, ey)
            while curr in parents:
                path.append({"x": curr[0], "y": curr[1]})
                curr = parents[curr]
            path.append({"x": sx, "y": sy})
            path.reverse()
            return path
            
        for dx, dy in neighbors:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < width and 0 <= ny < height:
                # Strictly forbid walking on ocean cells
                if water_type[ny, nx] == "ocean":
                    continue
                cost = get_travel_cost(cx, cy, nx, ny, elevation, biomes, water_type)
                new_g = g_score[(cx, cy)] + cost
                
                if (nx, ny) not in g_score or new_g < g_score[(nx, ny)]:
                    g_score[(nx, ny)] = new_g
                    # Heuristic: Euclidean distance
                    h = np.hypot(nx - ex, ny - ey) * 1.5
                    f = new_g + h
                    heapq.heappush(pq, (f, nx, ny))
                    parents[(nx, ny)] = (cx, cy)
                    
    # Fallback to direct line if A* fails
    return [{"x": sx, "y": sy}, {"x": ex, "y": ey}]

def generate_infrastructure(
    width: int,
    height: int,
    elevation: np.ndarray,
    biomes: np.ndarray,
    water_type: np.ndarray,
    river_flow: np.ndarray,
    town: Dict[str, Any],
    outpost: Dict[str, Any],
    seed_str: str
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Generates roads, bridges, POIs, and mobile caravan/guard tokens.
    """
    rng = np.random.default_rng(seed_from_string(seed_str))
    
    tx, ty = town["x"], town["y"]
    ox, oy = outpost["x"], outpost["y"]
    
    # 1. Generate A* Road Path
    road_path = astar(width, height, (tx, ty), (ox, oy), elevation, biomes, water_type)
    road_name = f"{town['name']}-{outpost['name']} Trail"
    
    roads = [{
        "id": "road_01",
        "path": road_path,
        "origin_reason": f"Established to secure trade and raw material haulage between the town of {town['name']} and the {outpost['type']} of {outpost['name']}."
    }]
    
    # 2. Place Bridges at River crossings
    bridges = []
    bridge_counter = 0
    for node in road_path:
        rx, ry = node["x"], node["y"]
        if water_type[ry, rx] == "river":
            bridge_counter += 1
            bridges.append({
                "id": f"bridge_{rx}_{ry}",
                "x": rx,
                "y": ry,
                "river_flow": float(river_flow[ry, rx]),
                "origin_reason": f"Built deterministically to span the rushing currents of the local river network along the {road_name}."
            })
            
    # 3. Generate simple dungeon POI
    # Find a cell far away from both Town and Outpost in a Mountain, Hills, or Desert
    pois = []
    poi_placed = False
    for y in range(height):
        for x in range(width):
            b = biomes[y, x]
            wt = water_type[y, x]
            dist_town = np.hypot(x - tx, y - ty)
            dist_outpost = np.hypot(x - ox, y - oy)
            
            if dist_town >= 18 and dist_outpost >= 18 and wt == "none":
                if b in ["Craggy Peaks", "Rolling Hills", "Arid Desert"]:
                    poi_name = f"{rng.choice(LAND_PREFIXES)}'s Deep"
                    poi_type = "dungeon"
                    
                    if b == "Craggy Peaks":
                        desc = "A high-altitude craggy stone fissure serving as an ancient monster den."
                    elif b == "Arid Desert":
                        desc = "A long-abandoned sun-bleached desert crypt harboring ancient secrets."
                    else:
                        desc = "An overgrown cavern system rumored to be infested by aggressive hill beasts."
                        
                    pois.append({
                        "id": "poi_01",
                        "name": poi_name,
                        "x": x,
                        "y": y,
                        "type": poi_type,
                        "description": desc,
                        "origin_reason": f"A geological formation appropriate for the {b.lower()} biome, now serving as a den of danger."
                    })
                    poi_placed = True
                    break
        if poi_placed:
            break
            
    if not poi_placed:
        # Fallback POI
        pois.append({
            "id": "poi_01",
            "name": "Ruined Keep",
            "x": (tx + ox) // 2 + 10,
            "y": (ty + oy) // 2 + 10,
            "type": "dungeon",
            "description": "An abandoned stone lookout tower built during the old border wars.",
            "origin_reason": "Built as an ancient border watchtower before falling into ruin."
        })
        
    # 4. Mobile Caravan Token
    # Route: goes from Town along the road to Outpost, then back.
    caravan_route = list(road_path)
    # Append reversed path to form a complete back-and-forth loop
    caravan_route_loop = caravan_route + list(reversed(road_path))[1:-1]
    
    cargo_type = "Timber" if "logging" in outpost["type"] else "Iron Ore"
    
    mobile_tokens = []
    mobile_tokens.append({
        "id": "caravan_01",
        "name": f"{town['name']} Merchant Supply",
        "type": "caravan",
        "route": caravan_route_loop,
        "cargo": cargo_type,
        "origin": outpost["id"]
    })
    
    # 5. Guard Patrol Token
    # Loop around the Town cell in a 5-step patrol path or circular path on land
    patrol_route = []
    # Let's search a 4-step loop adjacent to Town:
    # Town -> North -> East -> South -> West -> Town
    p_offsets = [(0, 0), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 0), (0, 0)]
    for dx, dy in p_offsets:
        px, py = tx + dx, ty + dy
        if 0 <= px < width and 0 <= py < height:
            if elevation[py, px] >= 0.45:  # land only
                patrol_route.append({"x": px, "y": py})
                
    if len(patrol_route) < 3:
        # Fallback patrol: along first 4 road cells
        patrol_route = road_path[:4] + list(reversed(road_path[:4]))[1:-1]
        
    mobile_tokens.append({
        "id": "patrol_01",
        "name": f"{town['name']} Perimeter Guard",
        "type": "patrol",
        "route": patrol_route,
        "cargo": None,
        "origin": town["id"]
    })
    
    return roads, bridges, pois, mobile_tokens
