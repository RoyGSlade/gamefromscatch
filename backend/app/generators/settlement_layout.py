import numpy as np
import heapq
from typing import List, Dict, Any, Tuple
from .noise import seed_from_string
from .buildings import create_building_template
from .job_slots import generate_job_slots
from .production_chains import generate_production_chains

def generate_local_road_path(
    width: int,
    height: int,
    start: Tuple[int, int],
    end: Tuple[int, int],
    occupied_mask: np.ndarray,
    road_mask: np.ndarray,
    local_bounds: Tuple[int, int, int, int]
) -> List[Dict[str, int]]:
    """
    Intra-settlement road pathfinder using A* constrained to the local area.
    Prefers merging with existing roads (cost 0.2) and strictly avoids buildings.
    """
    sx, sy = start
    ex, ey = end
    min_x, max_x, min_y, max_y = local_bounds
    
    pq = []
    heapq.heappush(pq, (0.0, sx, sy))
    g_score = { (sx, sy): 0.0 }
    parents = {}
    
    neighbors = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    found = False
    
    while pq:
        _, cx, cy = heapq.heappop(pq)
        
        if cx == ex and cy == ey:
            found = True
            break
            
        for dx, dy in neighbors:
            nx, ny = cx + dx, cy + dy
            if min_x <= nx <= max_x and min_y <= ny <= max_y:
                # Impassable if occupied by building footprint
                if occupied_mask[ny, nx]:
                    continue
                
                # Travel cost: highly prefer existing roads
                if road_mask[ny, nx]:
                    cost = 0.15
                else:
                    cost = 1.0
                    
                new_g = g_score[(cx, cy)] + cost
                
                if (nx, ny) not in g_score or new_g < g_score[(nx, ny)]:
                    g_score[(nx, ny)] = new_g
                    # Heuristic: Manhattan distance
                    h = abs(nx - ex) + abs(ny - ey)
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
        
    return []

def generate_settlement_layout(
    settlement: Dict[str, Any],
    elevation: np.ndarray,
    biomes: np.ndarray,
    water_type: np.ndarray,
    global_roads: List[Dict[str, Any]],
    global_width: int,
    global_height: int
) -> Dict[str, Any]:
    """
    Deterministically compiles the full spatial layout for a settlement.
    """
    settlement_id = settlement["id"]
    settlement_type = settlement["type"]
    tx, ty = settlement["x"], settlement["y"]
    seed_str = f"layout_{settlement_id}_{tx}_{ty}"
    rng = np.random.default_rng(seed_from_string(seed_str))
    
    # 1. Define Local Bounding Area (21x21 grid centered at tx, ty)
    radius = 10
    min_x = max(0, tx - radius)
    max_x = min(global_width - 1, tx + radius)
    min_y = max(0, ty - radius)
    max_y = min(global_height - 1, ty + radius)
    local_bounds = (min_x, max_x, min_y, max_y)
    
    # Grid masks for spatial validation
    occupied_mask = np.zeros((global_height, global_width), dtype=bool)
    road_mask = np.zeros((global_height, global_width), dtype=bool)
    
    # Mark global water bodies as occupied (unless waterfront building)
    water_mask = (water_type == "ocean") | (water_type == "lake") | (water_type == "river")
    
    # 2. Seed Districts based on settlement type and local context
    districts = []
    
    # Determine proximity to water bodies
    is_coastal = any(water_type[y, x] in ["ocean", "lake"] for y in range(min_y, max_y + 1) for x in range(min_x, max_x + 1))
    has_river = any(water_type[y, x] == "river" for y in range(min_y, max_y + 1) for x in range(min_x, max_x + 1))
    
    if settlement_type == "town":
        # Town districts
        districts.append({
            "id": f"dist_{settlement_id}_center", "settlement_id": settlement_id, "type": "town_center",
            "x": tx, "y": ty, "radius": 2, "origin_reasons": ["Geographic nexus point of the region."],
            "required_services": ["Law", "Defense"], "local_danger_level": 0.05, "wealth_level": "common"
        })
        districts.append({
            "id": f"dist_{settlement_id}_market", "settlement_id": settlement_id, "type": "market",
            "x": max(min_x + 2, min(max_x - 2, tx + 4)), "y": ty, "radius": 2,
            "origin_reasons": ["Set along the trade trail intersections for caravan access."],
            "required_services": ["Commerce", "Storage"], "local_danger_level": 0.1, "wealth_level": "wealthy"
        })
        districts.append({
            "id": f"dist_{settlement_id}_residential", "settlement_id": settlement_id, "type": "residential_common",
            "x": max(min_x + 2, min(max_x - 2, tx - 4)), "y": max(min_y + 2, min(max_y - 2, ty + 3)), "radius": 3,
            "origin_reasons": ["Safe lowland cluster away from heavy industrial noise."],
            "required_services": ["Water", "Sanitation"], "local_danger_level": 0.05, "wealth_level": "poor"
        })
        districts.append({
            "id": f"dist_{settlement_id}_craft", "settlement_id": settlement_id, "type": "craft",
            "x": tx, "y": max(min_y + 2, min(max_y - 2, ty - 4)), "radius": 2,
            "origin_reasons": ["Configured near resource dropoffs for optimal smelting/forging."],
            "required_services": ["Fuel", "Tools"], "local_danger_level": 0.2, "wealth_level": "common"
        })
        districts.append({
            "id": f"dist_{settlement_id}_religious", "settlement_id": settlement_id, "type": "religious",
            "x": max(min_x + 2, min(max_x - 2, tx - 3)), "y": max(min_y + 2, min(max_y - 2, ty - 3)), "radius": 2,
            "origin_reasons": ["Elevated hillside clearing dedicated to the ancient divines."],
            "required_services": ["Consolation"], "local_danger_level": 0.02, "wealth_level": "common"
        })
        if has_river:
            # Place river industry district adjacent to river
            river_cells = [(x, y) for y in range(min_y, max_y + 1) for x in range(min_x, max_x + 1) if water_type[y, x] == "river"]
            if river_cells:
                rx, ry = river_cells[0]
                districts.append({
                    "id": f"dist_{settlement_id}_river_industry", "settlement_id": settlement_id, "type": "river_industry",
                    "x": rx, "y": ry, "radius": 2, "origin_reasons": ["Tapped directly onto riverbanks for waterwheel energy."],
                    "required_services": ["Irrigation", "Power"], "local_danger_level": 0.3, "wealth_level": "common"
                })
        if is_coastal:
            # Place docks district adjacent to navigable water
            water_cells = [(x, y) for y in range(min_y, max_y + 1) for x in range(min_x, max_x + 1) if water_type[y, x] in ["ocean", "lake"]]
            if water_cells:
                wx, wy = water_cells[0]
                districts.append({
                    "id": f"dist_{settlement_id}_docks", "settlement_id": settlement_id, "type": "docks",
                    "x": wx, "y": wy, "radius": 2, "origin_reasons": ["Protected shoreline providing natural deepwater anchoring."],
                    "required_services": ["Mooring", "Storage"], "local_danger_level": 0.15, "wealth_level": "poor"
                })
    else:
        # Outpost districts
        districts.append({
            "id": f"dist_{settlement_id}_extraction", "settlement_id": settlement_id, "type": "extraction_site",
            "x": tx, "y": ty, "radius": 2, "origin_reasons": ["Centered exactly over high-yield procedurally mapped veins/forests."],
            "required_services": ["Security", "Shoring"], "local_danger_level": 0.45, "wealth_level": "poor"
        })
        districts.append({
            "id": f"dist_{settlement_id}_worker_camp", "settlement_id": settlement_id, "type": "worker_camp",
            "x": max(min_x + 2, min(max_x - 2, tx - 4)), "y": max(min_y + 2, min(max_y - 2, ty + 3)), "radius": 2,
            "origin_reasons": ["Bunkhouse clearing placed upwind from raw excavation dust."],
            "required_services": ["Shelter", "Rations"], "local_danger_level": 0.15, "wealth_level": "poor"
        })
        districts.append({
            "id": f"dist_{settlement_id}_storage", "settlement_id": settlement_id, "type": "storage_yard",
            "x": max(min_x + 2, min(max_x - 2, tx + 3)), "y": max(min_y + 2, min(max_y - 2, ty - 3)), "radius": 2,
            "origin_reasons": ["Flat yard situated for heavy cargo wagon loading."],
            "required_services": ["Defense", "Storage"], "local_danger_level": 0.25, "wealth_level": "common"
        })
        districts.append({
            "id": f"dist_{settlement_id}_overseer", "settlement_id": settlement_id, "type": "overseer_office",
            "x": max(min_x + 1, min(max_x - 1, tx + 1)), "y": max(min_y + 1, min(max_y - 1, ty + 1)), "radius": 1,
            "origin_reasons": ["Elevated watch point to inspect logging/mining progress."],
            "required_services": ["Administration"], "local_danger_level": 0.1, "wealth_level": "wealthy"
        })
        
    # 3. Deterministically Spawn Building Bounding Footprints without overlap
    buildings = []
    
    # Establish building proposals list based on settlement type
    proposals = []
    
    if settlement_type == "town":
        proposals.append(("dist_town_01_center", "town_hall", "Town Hall", "Administrative keep and court.", ["Sovereign presence."], [], ["lumber_planks"], ["tax_revenue"], 2, 2, 3))
        proposals.append(("dist_town_01_center", "tavern/inn", "The Prancing Griffin", "Local tavern providing rest and drinks.", ["Social hub."], ["ale", "bread"], ["gold"], ["waste"], 1, 2, 2))
        proposals.append(("dist_town_01_market", "general_store", "Realm Imports", "Merchant depot trading supplies.", ["Trade routing."], ["wool", "grain"], ["goods"], ["gold"], 1, 1, 2))
        proposals.append(("dist_town_01_craft", "blacksmith", "Iron Hearth Forge", "Smithy producing heavy tools.", ["Sub-surface ores nearby."], ["iron_ingots", "coal"], ["iron_tools"], ["ash"], 2, 1, 3))
        proposals.append(("dist_town_01_religious", "shrine", "Shrine of Eld", "Sacred clearing for meditation.", ["Ancient sacred clearing."], [], ["devotion"], ["incense"], 1, 1, 1))
        proposals.append(("dist_town_01_storage", "granary", "Royal Granary", "Food stockpiling storehouse.", ["Farmlands irrigation."], ["wheat_flour"], ["stockpile"], ["waste"], 1, 2, 2))
        
        # Contextual buildings
        if has_river and "Timber" in settlement["resources"]:
            proposals.append(("dist_town_01_river_industry", "sawmill", "Riverfront Sawmill", "Water-powered sawing engine.", ["Rushing river currents.", "Dense timber forests."], ["prime_timber"], ["lumber_planks"], ["sawdust"], 2, 2, 2))
        if "Grain" in settlement["resources"]:
            proposals.append(("dist_town_01_river_industry" if has_river else "dist_town_01_center", "mill", "Tethered Gristmill", "Grain milling facility.", ["Farmland crops."], ["grain_harvest"], ["wheat_flour"], ["chaff"], 1, 1, 2))
        if is_coastal:
            proposals.append(("dist_town_01_docks", "docks", "Sovereign Wharf", "Harbor docks and slips.", ["Navigable water."], [], ["mooring_slips"], ["shipments"], 2, 3, 2))
            proposals.append(("dist_town_01_docks", "fishmonger", "The Salty Net", "Curing and trade store.", ["Fish nodes nearby."], ["fresh_catch"], ["salted_fish"], ["offal"], 1, 1, 2))
            
        # Houses abstractly scaled by population: e.g. population / 250 (range 8 to 20)
        num_houses = max(8, min(20, settlement["population"] // 250))
        for h_idx in range(num_houses):
            proposals.append(("dist_town_01_residential", f"house", f"Cottage {h_idx+1}", "Commoner residential housing.", ["Settlement growth."], ["bread"], [], ["waste"], 1, 1, 1))
    else:
        # Outpost proposals
        is_logging = "logging" in settlement_type or "lumber" in settlement_type or "Timber" in settlement["resources"]
        main_type = "logging_yard" if is_logging else "mine_entrance"
        main_name = "Whispering Logger Yard" if is_logging else "Deep Stone Shaft"
        main_purpose = "Felling prime timber logs." if is_logging else "Extracting high-yield iron/gold veins."
        main_reasons = ["Ancient groves."] if is_logging else ["Craggy subterranean veins."]
        main_out = "prime_timber" if is_logging else "raw_ore"
        
        proposals.append(("dist_outpost_01_extraction", main_type, main_name, main_purpose, main_reasons, [], [main_out], [], 2, 2, 2))
        proposals.append(("dist_outpost_01_worker_camp", "worker_bunkhouse", "Laborer Bunkhouse", "Bunks for extraction crew.", ["Worker lodging."], ["rations"], [], ["waste"], 1, 2, 1))
        proposals.append(("dist_outpost_01_storage", "storage_shed", "Secure Supply Lockup", "Supply yard and stockpile.", ["Extraction flow."], [main_out], ["cargo_wagons"], [], 1, 2, 2))
        proposals.append(("dist_outpost_01_storage", "tool_repair_shed", "Grindstone Yard", "Tool sharpening hut.", ["Durable tools required."], ["iron_tools"], ["sharpened_axes" if is_logging else "honed_picks"], ["metal_filings"], 1, 1, 1))
        proposals.append(("dist_outpost_01_overseer", "overseer_office", "Overseer Quarters", "Logistical control room.", ["State administrative mandate."], [], ["logistics_record"], [], 1, 1, 2))
        proposals.append(("dist_outpost_01_extraction", "watch_post", "Sentry Turret", "Tall wooden guard lookout.", ["Borderlands security."], [], ["perception_guard"], [], 1, 1, 1))
        
    # Execute Placement Search spiral around district centers
    for p in proposals:
        d_type_id, b_type, b_name, b_purpose, b_reasons, b_req, b_prod, b_cons, b_w, b_h, b_t = p
        
        # Find associated district
        target_dist = next((dist for dist in districts if dist["id"] == d_type_id or dist["type"] == d_type_id.split("_")[-1]), None)
        if not target_dist:
            # Fallback to town center or extraction site
            target_dist = districts[0]
            
        dx, dy = target_dist["x"], target_dist["y"]
        placed = False
        
        # Spiral Search outwards to find AABB clear spot
        for offset in range(0, radius + 1):
            if placed:
                break
            for spy in range(dy - offset, dy + offset + 1):
                if placed:
                    break
                for spx in range(dx - offset, dx + offset + 1):
                    if min_x <= spx <= max_x - b_w + 1 and min_y <= spy <= max_y - b_h + 1:
                        # Validate all cells in the requested bounding footprint box
                        clear = True
                        for py in range(spy, spy + b_h):
                            for px in range(spx, spx + b_w):
                                # Must not overlap with another building
                                if occupied_mask[py, px]:
                                    clear = False
                                    break
                                    
                                # Standard building cannot overlap with water
                                is_waterfront = b_type in ["docks", "sawmill", "fishmonger", "fishery"]
                                if water_mask[py, px] and not is_waterfront:
                                    clear = False
                                    break
                                    
                        # Waterfront buildings must touch land AND water
                        if clear and b_type in ["docks", "sawmill", "fishmonger", "fishery"]:
                            touches_land = False
                            touches_water = False
                            for py in range(spy, spy + b_h):
                                for px in range(spx, spx + b_w):
                                    if water_mask[py, px]:
                                        touches_water = True
                                    else:
                                        touches_land = True
                                        
                            # If it does not touch both, we look further
                            if not (touches_land and touches_water):
                                clear = False
                                
                        if clear:
                            # Apply marking
                            for py in range(spy, spy + b_h):
                                for px in range(spx, spx + b_w):
                                    occupied_mask[py, px] = True
                                    
                            bld = create_building_template(
                                settlement_id, target_dist["id"], b_type, spx, spy, b_w, b_h, b_t,
                                b_name, b_purpose, b_reasons, b_req, b_prod, b_cons
                            )
                            buildings.append(bld)
                            placed = True
                            break
                            
    # 4. Generate Job Slots and bind to buildings
    job_slots = []
    for bld in buildings:
        jobs = generate_job_slots(settlement_id, bld)
        bld["job_slots"] = [j["id"] for j in jobs]
        job_slots.extend(jobs)
        
    # 5. Generate Production Chains
    prod_chains = generate_production_chains(settlement_id, settlement_type, settlement["resources"], buildings)
    
    # 6. Generate Local Settlement Roads
    local_roads = []
    road_counter = 1
    
    # Find settlement entrance cell (closest global road cell in local area, or center coordinate fallback)
    entrance_x, entrance_y = tx, ty
    found_entrance = False
    for r in global_roads:
        if found_entrance:
            break
        for node in r["path"]:
            gx, gy = node["x"], node["y"]
            if min_x <= gx <= max_x and min_y <= gy <= max_y:
                # Must not be occupied by building footprint
                if not occupied_mask[gy, gx]:
                    entrance_x, entrance_y = gx, gy
                    found_entrance = True
                    break
                    
    # Generate Main Road connecting Entrance to Town Center
    center_road_path = generate_local_road_path(
        global_width, global_height, (entrance_x, entrance_y), (tx, ty), occupied_mask, road_mask, local_bounds
    )
    if center_road_path:
        for node in center_road_path:
            road_mask[node["y"], node["x"]] = True
        local_roads.append({
            "id": f"road_{settlement_id}_{road_counter}",
            "path": center_road_path,
            "road_type": "stone" if settlement_type == "town" else "dirt"
        })
        road_counter += 1
        
    # Connect all other district centers and public buildings to the road network
    for dist in districts:
        if dist["type"] == "town_center" or dist["type"] == "extraction_site":
            continue
            
        dist_x, dist_y = dist["x"], dist["y"]
        # Find closest point already on the road
        road_coords = np.argwhere(road_mask)
        if len(road_coords) > 0:
            # Sort by distance
            road_coords_list = [(int(c[1]), int(c[0])) for c in road_coords]
            road_coords_list.sort(key=lambda coord: abs(coord[0] - dist_x) + abs(coord[1] - dist_y))
            closest_road = road_coords_list[0]
            
            # Draw path
            dist_road_path = generate_local_road_path(
                global_width, global_height, closest_road, (dist_x, dist_y), occupied_mask, road_mask, local_bounds
            )
            if dist_road_path:
                for node in dist_road_path:
                    road_mask[node["y"], node["x"]] = True
                    
                r_type = "stone" if dist["type"] in ["market", "civic"] else "dirt"
                if dist["type"] == "docks":
                    r_type = "dockwalk"
                    
                local_roads.append({
                    "id": f"road_{settlement_id}_{road_counter}",
                    "path": dist_road_path,
                    "road_type": r_type
                })
                road_counter += 1
                
    # Connect any public buildings not adjacent to roads
    for bld in buildings:
        if bld["public_access"]:
            bx, by = bld["x"], bld["y"]
            road_coords = np.argwhere(road_mask)
            if len(road_coords) > 0:
                road_coords_list = [(int(c[1]), int(c[0])) for c in road_coords]
                road_coords_list.sort(key=lambda coord: abs(coord[0] - bx) + abs(coord[1] - by))
                closest_road = road_coords_list[0]
                
                # Draw small connector footpath path
                footpath = generate_local_road_path(
                    global_width, global_height, closest_road, (bx, by), occupied_mask, road_mask, local_bounds
                )
                if footpath:
                    for node in footpath:
                        road_mask[node["y"], node["x"]] = True
                    local_roads.append({
                        "id": f"road_{settlement_id}_{road_counter}",
                        "path": footpath,
                        "road_type": "footpath"
                    })
                    road_counter += 1
                    
    return {
        "id": f"layout_{settlement_id}",
        "settlement_id": settlement_id,
        "seed": seed_str,
        "districts": districts,
        "local_roads": local_roads,
        "buildings": buildings,
        "production_chains": prod_chains,
        "job_slots": job_slots
    }
