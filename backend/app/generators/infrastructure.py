import heapq
import numpy as np
from typing import List, Dict, Tuple, Any
from .noise import seed_from_string
from .settlements import LAND_PREFIXES, LAND_SUFFIXES, SETTLEMENT_TIERS

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
    If a land-only path is not found, runs a second-pass that permits ocean traversal with high penalty.
    """
    sx, sy = start
    ex, ey = end
    
    # Pass 1: Land-only search
    pq = []
    heapq.heappush(pq, (0.0, sx, sy))
    g_score = { (sx, sy): 0.0 }
    parents = {}
    
    neighbors = [
        (-1, 0), (1, 0), (0, -1), (0, 1),
        (-1, -1), (1, -1), (-1, 1), (1, 1)
    ]
    
    found = False
    while pq:
        _, cx, cy = heapq.heappop(pq)
        
        if cx == ex and cy == ey:
            found = True
            break
            
        for dx, dy in neighbors:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < width and 0 <= ny < height:
                # Strictly forbid walking on ocean cells in pass 1
                if water_type[ny, nx] == "ocean":
                    continue
                cost = get_travel_cost(cx, cy, nx, ny, elevation, biomes, water_type)
                new_g = g_score[(cx, cy)] + cost
                
                if (nx, ny) not in g_score or new_g < g_score[(nx, ny)]:
                    g_score[(nx, ny)] = new_g
                    h = np.hypot(nx - ex, ny - ey) * 1.5
                    f = new_g + h
                    heapq.heappush(pq, (f, nx, ny))
                    parents[(nx, ny)] = (cx, cy)
                    
    if found:
        path = []
        curr = (ex, ey)
        while curr in parents:
            path.append({"x": int(curr[0]), "y": int(curr[1])})
            curr = parents[curr]
        path.append({"x": int(sx), "y": int(sy)})
        path.reverse()
        return path

    # Pass 2: Relaxed search (permits ocean traversal at huge penalty)
    pq = []
    heapq.heappush(pq, (0.0, sx, sy))
    g_score = { (sx, sy): 0.0 }
    parents = {}
    
    while pq:
        _, cx, cy = heapq.heappop(pq)
        
        if cx == ex and cy == ey:
            path = []
            curr = (ex, ey)
            while curr in parents:
                path.append({"x": int(curr[0]), "y": int(curr[1])})
                curr = parents[curr]
            path.append({"x": int(sx), "y": int(sy)})
            path.reverse()
            return path
            
        for dx, dy in neighbors:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < width and 0 <= ny < height:
                # Allow ocean cells with a massive penalty
                if water_type[ny, nx] == "ocean":
                    cost = get_travel_cost(cx, cy, nx, ny, elevation, biomes, water_type) + 5000.0
                else:
                    cost = get_travel_cost(cx, cy, nx, ny, elevation, biomes, water_type)
                new_g = g_score[(cx, cy)] + cost
                
                if (nx, ny) not in g_score or new_g < g_score[(nx, ny)]:
                    g_score[(nx, ny)] = new_g
                    h = np.hypot(nx - ex, ny - ey) * 1.5
                    f = new_g + h
                    heapq.heappush(pq, (f, nx, ny))
                    parents[(nx, ny)] = (cx, cy)

    # Absolute fallback: empty list instead of fake direct line
    return []


def _classify_road_type(s1_type: str, s2_type: str) -> str:
    """Determine road hierarchy type based on endpoint settlement tiers."""
    tier1 = SETTLEMENT_TIERS.get(s1_type, 1)
    tier2 = SETTLEMENT_TIERS.get(s2_type, 1)
    max_tier = max(tier1, tier2)
    min_tier = min(tier1, tier2)
    
    if max_tier >= 3 and min_tier >= 2:
        return "highway"
    elif max_tier >= 2:
        return "trade_road"
    else:
        return "dirt_road"


def _compute_route_status(road_path, water_type):
    """Determine route operational status from path cells."""
    if not road_path:
        return "blocked"
    for node in road_path:
        if water_type[node["y"], node["x"]] == "ocean":
            return "requires_ferry"
    return "active"


def _build_delaunay_edges(settlements: List[Dict[str, Any]]) -> List[Tuple[int, int]]:
    """
    Compute Delaunay triangulation edges from settlement positions.
    Falls back to minimum spanning tree-style nearest-neighbor if <3 settlements.
    """
    n = len(settlements)
    if n < 2:
        return []
    
    if n == 2:
        return [(0, 1)]
    
    try:
        from scipy.spatial import Delaunay
        points = np.array([[s["x"], s["y"]] for s in settlements], dtype=float)
        tri = Delaunay(points)
        
        edges = set()
        for simplex in tri.simplices:
            for i in range(3):
                for j in range(i + 1, 3):
                    a, b = simplex[i], simplex[j]
                    edges.add((min(a, b), max(a, b)))
        
        return list(edges)
    except Exception:
        # Fallback: connect each settlement to its nearest unconnected neighbor
        edges = []
        connected = {0}
        while len(connected) < n:
            best_dist = float("inf")
            best_edge = None
            for i in connected:
                for j in range(n):
                    if j in connected:
                        continue
                    d = np.hypot(
                        settlements[i]["x"] - settlements[j]["x"],
                        settlements[i]["y"] - settlements[j]["y"]
                    )
                    if d < best_dist:
                        best_dist = d
                        best_edge = (min(i, j), max(i, j))
            if best_edge:
                edges.append(best_edge)
                connected.add(best_edge[0])
                connected.add(best_edge[1])
        return edges


def generate_infrastructure(
    width: int,
    height: int,
    elevation: np.ndarray,
    biomes: np.ndarray,
    water_type: np.ndarray,
    river_flow: np.ndarray,
    settlements: List[Dict[str, Any]],
    seed_str: str
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Generates roads (via Delaunay graph), bridges, POIs, and mobile caravan/guard tokens.
    Roads are classified into hierarchy types based on endpoint settlement tiers.
    """
    rng = np.random.default_rng(seed_from_string(seed_str))
    
    # -------------------------------------------------------
    # 1. Build Delaunay Graph and Route Roads
    # -------------------------------------------------------
    edges = _build_delaunay_edges(settlements)
    
    roads = []
    all_road_paths = []
    
    for edge_idx, (i, j) in enumerate(edges):
        s1 = settlements[i]
        s2 = settlements[j]
        
        road_path = astar(
            width, height,
            (s1["x"], s1["y"]),
            (s2["x"], s2["y"]),
            elevation, biomes, water_type
        )
        
        road_type = _classify_road_type(s1["type"], s2["type"])
        route_status = _compute_route_status(road_path, water_type)
        
        road = {
            "id": f"road_{edge_idx + 1:02d}",
            "path": road_path,
            "origin_reason": f"Established to secure trade and material haulage between {s1['name']} and {s2['name']}.",
            "type": road_type,
            "route_status": route_status,
        }
        roads.append(road)
        all_road_paths.append(road_path)
    
    # -------------------------------------------------------
    # 2. Place Bridges at River crossings
    # -------------------------------------------------------
    bridges = []
    bridge_seen = set()
    
    for road_idx, road in enumerate(roads):
        road_path = road["path"]
        road_name = road["id"]
        
        for node in road_path:
            rx, ry = node["x"], node["y"]
            if water_type[ry, rx] == "river" and (rx, ry) not in bridge_seen:
                bridge_seen.add((rx, ry))
                bridges.append({
                    "id": f"bridge_{rx}_{ry}",
                    "x": rx,
                    "y": ry,
                    "river_flow": float(river_flow[ry, rx]),
                    "origin_reason": f"Built to span the river along {road_name}.",
                })
    
    # -------------------------------------------------------
    # 3. Generate Dungeon POIs (biome-specific taxonomy)
    # -------------------------------------------------------
    pois = []
    poi_count = 0
    
    # Settlement positions for distance checks
    settlement_coords = [(s["x"], s["y"]) for s in settlements]
    
    # Dungeon taxonomy by biome
    dungeon_biomes = {
        "Craggy Peaks": ("mountain_warren", "A high-altitude craggy stone fissure serving as an ancient monster den."),
        "Frozen Peaks": ("frozen_lair", "A frost-rimmed cavern deep beneath the frozen peaks, home to ancient ice beasts."),
        "Rolling Hills": ("hill_cave", "An overgrown cavern system rumored to be infested by aggressive hill beasts."),
        "Arid Desert": ("desert_crypt", "A long-abandoned sun-bleached desert crypt harboring ancient secrets."),
        "Murky Swamp": ("swamp_crypt", "A half-submerged crypt seeping with toxic miasma and undead guardians."),
        "Dense Forest": ("bandit_camp", "A fortified forest clearing used as a base by a notorious bandit clan."),
    }
    
    for biome_name, (poi_subtype, description) in dungeon_biomes.items():
        placed = False
        for y in range(height):
            for x in range(width):
                if biomes[y, x] != biome_name or water_type[y, x] != "none":
                    continue
                
                # Must be far from all settlements
                min_dist = min(np.hypot(x - sx, y - sy) for sx, sy in settlement_coords)
                if min_dist < 18:
                    continue
                
                poi_count += 1
                poi_name = f"{rng.choice(LAND_PREFIXES)}'s {rng.choice(['Deep', 'Hollow', 'Maw', 'Tomb', 'Den'])}"
                pois.append({
                    "id": f"poi_{poi_count:02d}",
                    "name": poi_name,
                    "x": x,
                    "y": y,
                    "type": "dungeon",
                    "description": description,
                    "origin_reason": f"A geological formation in the {biome_name.lower()} biome, now serving as a {poi_subtype.replace('_', ' ')}.",
                })
                placed = True
                break
            if placed:
                break
    
    # Fallback if no POIs placed at all
    if not pois:
        cx = (settlements[0]["x"] + settlements[-1]["x"]) // 2 + 10
        cy = (settlements[0]["y"] + settlements[-1]["y"]) // 2 + 10
        cx = min(cx, width - 1)
        cy = min(cy, height - 1)
        pois.append({
            "id": "poi_01",
            "name": "Ruined Keep",
            "x": cx,
            "y": cy,
            "type": "dungeon",
            "description": "An abandoned stone lookout tower built during the old border wars.",
            "origin_reason": "Built as an ancient border watchtower before falling into ruin.",
        })
    
    # -------------------------------------------------------
    # 4. Mobile Tokens (Caravans and Patrols)
    # -------------------------------------------------------
    mobile_tokens = []
    token_count = 0
    
    # Create a caravan for each road that connects a capital/town to an outpost
    for road_idx, road in enumerate(roads):
        road_path = road["path"]
        if len(road_path) < 2:
            continue
        
        i, j = edges[road_idx]
        s1 = settlements[i]
        s2 = settlements[j]
        
        # Only create caravans between settlements of different tiers
        t1 = SETTLEMENT_TIERS.get(s1["type"], 1)
        t2 = SETTLEMENT_TIERS.get(s2["type"], 1)
        
        if t1 == t2 and t1 == 1:
            continue  # skip outpost-to-outpost
        
        # The caravan goes from the higher-tier settlement to lower and back
        if t1 >= t2:
            origin_s = s1
            dest_s = s2
        else:
            origin_s = s2
            dest_s = s1
            road_path = list(reversed(road_path))
        
        caravan_route_loop = road_path + list(reversed(road_path))[1:-1]
        
        # Determine cargo based on destination outpost resources
        cargo_type = dest_s["resources"][0] if dest_s["resources"] else "Goods"
        cargo_manifest = {}
        for res in dest_s["resources"]:
            cargo_manifest[res] = int(rng.integers(20, 80))
        
        token_count += 1
        mobile_tokens.append({
            "id": f"caravan_{token_count:02d}",
            "name": f"{origin_s['name']} Merchant Supply",
            "type": "caravan",
            "route": caravan_route_loop,
            "cargo": cargo_type,
            "cargo_manifest": cargo_manifest,
            "movement_state": "moving",
            "origin": origin_s["id"],
        })
    
    # Create a patrol for each capital/town
    patrol_count = 0
    for s in settlements:
        if s["type"] not in ("capital", "town"):
            continue
        
        patrol_count += 1
        sx, sy = s["x"], s["y"]
        
        # Build a patrol loop around the settlement
        patrol_route = []
        p_offsets = [(0, 0), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 0), (0, 0)]
        for dx, dy in p_offsets:
            px, py = sx + dx, sy + dy
            if 0 <= px < width and 0 <= py < height:
                if elevation[py, px] >= 0.45:
                    patrol_route.append({"x": px, "y": py})
        
        if len(patrol_route) < 3:
            # Fallback: use first road's initial cells
            if roads and roads[0]["path"]:
                rp = roads[0]["path"]
                patrol_route = rp[:4] + list(reversed(rp[:4]))[1:-1]
            else:
                patrol_route = [{"x": sx, "y": sy}, {"x": min(sx + 1, width - 1), "y": sy}, {"x": sx, "y": sy}]
        
        mobile_tokens.append({
            "id": f"patrol_{patrol_count:02d}",
            "name": f"{s['name']} Perimeter Guard",
            "type": "patrol",
            "route": patrol_route,
            "cargo": None,
            "cargo_manifest": None,
            "movement_state": "moving",
            "origin": s["id"],
        })
    
    return roads, bridges, pois, mobile_tokens
