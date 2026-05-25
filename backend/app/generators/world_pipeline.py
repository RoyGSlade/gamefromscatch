import numpy as np
from typing import Dict, Any
from .terrain import generate_terrain
from .hydrology import generate_rivers
from .resources import generate_resources
from .settlements import place_settlements
from .infrastructure import generate_infrastructure
from .settlement_layout import generate_settlement_layout

def generate_full_world_slice(seed_str: str) -> Dict[str, Any]:
    """
    Master pipeline orchestrator that processes terrain, hydrology,
    resources, settlements, and infrastructure to return the unified world slice.
    """
    width = 128
    height = 128
    
    # 1. Terrain Generation (multi-landmass tectonic plates)
    terrain_data = generate_terrain(width, height, seed_str)
    elevation = terrain_data["elevation"]
    moisture = terrain_data["moisture"]
    temperature = terrain_data["temperature"]
    hillshade = terrain_data["hillshade"]
    biomes = terrain_data["biomes"]
    sea_level = terrain_data["sea_level"]
    
    # 2. Hydrology (Rivers & Lakes)
    river_paths, water_type, river_flow = generate_rivers(
        width, height, elevation, biomes, sea_level, seed_str
    )
    
    # Update biomes based on lakes
    for y in range(height):
        for x in range(width):
            if water_type[y, x] == "lake":
                biomes[y, x] = "Freshwater Lake"
                
    # 3. Resources Distribution (12-type expanded taxonomy)
    resources_list, resource_grid = generate_resources(
        width, height, biomes, water_type, seed_str
    )
    
    # 4. Place Settlements (Capital, Towns, and Resource Outposts)
    settlements_list, _ = place_settlements(
        width, height, elevation, biomes, water_type, resources_list, seed_str
    )
    
    # 5. Generate Infrastructure (Delaunay road graph, Bridges, POIs, Mobile Tokens)
    roads, bridges, pois, mobile_tokens = generate_infrastructure(
        width, height, elevation, biomes, water_type, river_flow,
        settlements_list, seed_str
    )

    # Build set of road cells for travel cost adjustment, with road type for differentiation
    road_cell_types = {}  # (x, y) -> road_type
    for road in roads:
        road_type = road.get("type", "dirt_road")
        for node in road["path"]:
            key = (node["x"], node["y"])
            # Keep the highest-tier road type if multiple roads share a cell
            existing = road_cell_types.get(key)
            if existing is None or _road_type_priority(road_type) > _road_type_priority(existing):
                road_cell_types[key] = road_type
    
    # 6. Build the Cell list for output
    cells = []
    for y in range(height):
        for x in range(width):
            b = biomes[y, x]
            wt = water_type[y, x]
            
            # Base travel cost by terrain
            if wt == "ocean":
                travel_cost = 99.0
            elif wt == "lake":
                travel_cost = 80.0
            elif b in ["Craggy Peaks", "Frozen Peaks"]:
                travel_cost = 10.0
            elif b == "Rolling Hills":
                travel_cost = 3.5
            elif b == "Dense Forest":
                travel_cost = 2.0
            elif b == "Murky Swamp":
                travel_cost = 4.5
            else:
                travel_cost = 1.0
                
            # Roads reduce travel cost based on road tier
            road_type = road_cell_types.get((x, y))
            if road_type == "highway":
                travel_cost = 0.3
            elif road_type == "trade_road":
                travel_cost = 0.5
            elif road_type == "dirt_road":
                travel_cost = 0.8
                
            cells.append({
                "x": x,
                "y": y,
                "elevation": float(np.round(elevation[y, x], 4)),
                "moisture": float(np.round(moisture[y, x], 4)),
                "temperature": float(np.round(temperature[y, x], 4)),
                "biome": str(biomes[y, x]),
                "hillshade": float(np.round(hillshade[y, x], 4)),
                "water_type": str(water_type[y, x]),
                "river_flow": float(river_flow[y, x]),
                "travel_cost": float(travel_cost),
                "resources": resource_grid[y][x]
            })
            
    # 7. Generate Settlement Layouts
    settlement_layouts = []
    for s in settlements_list:
        layout = generate_settlement_layout(s, elevation, biomes, water_type, roads, width, height)
        settlement_layouts.append(layout)
        
    return {
        "seed": seed_str,
        "width": width,
        "height": height,
        "cells": cells,
        "rivers": river_paths,
        "settlements": settlements_list,
        "roads": roads,
        "bridges": bridges,
        "resources": resources_list,
        "pois": pois,
        "mobile_tokens": mobile_tokens,
        "settlement_layouts": settlement_layouts
    }


def _road_type_priority(road_type: str) -> int:
    """Returns priority value for road types (higher = better road)."""
    return {"highway": 3, "trade_road": 2, "dirt_road": 1}.get(road_type, 0)
