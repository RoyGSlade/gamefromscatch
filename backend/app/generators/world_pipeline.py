import numpy as np
from typing import Dict, Any
from .terrain import generate_terrain
from .hydrology import generate_rivers
from .resources import generate_resources
from .settlements import place_settlements
from .infrastructure import generate_infrastructure

def generate_full_world_slice(seed_str: str) -> Dict[str, Any]:
    """
    Master pipeline orchestrator that processes terrain, hydrology,
    resources, settlements, and infrastructure to return the unified world slice.
    """
    width = 128
    height = 128
    
    # 1. Terrain Generation
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
    
    # Update biomes based on lakes (if water_type is lake, we can color it or set biome as Lake)
    for y in range(height):
        for x in range(width):
            if water_type[y, x] == "lake":
                biomes[y, x] = "Freshwater Lake"
                
    # 3. Resources Distribution
    resources_list, resource_grid = generate_resources(
        width, height, biomes, water_type, seed_str
    )
    
    # 4. Place Settlements (Town and Outpost)
    settlements_list, town, outpost = place_settlements(
        width, height, elevation, biomes, water_type, resources_list, seed_str
    )
    
    # 5. Generate Infrastructure (Roads, Bridges, POIs, Mobile Tokens)
    roads, bridges, pois, mobile_tokens = generate_infrastructure(
        width, height, elevation, biomes, water_type, river_flow, town, outpost, seed_str
    )
    
    # 6. Build the Cell list for output
    cells = []
    for y in range(height):
        for x in range(width):
            # Compute a realistic travel cost based on elevation gradient, water, and biomes
            b = biomes[y, x]
            wt = water_type[y, x]
            
            # Deep/shallow ocean are hard to travel (unless via boat, but on foot impassable)
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
                travel_cost = 1.0  # flat land / Plains / Beach / Desert
                
            # Roads drastically lower travel cost to a minimum base!
            # (We will check if this cell is part of any road)
            is_on_road = False
            for road in roads:
                for node in road["path"]:
                    if node["x"] == x and node["y"] == y:
                        is_on_road = True
                        break
                        
            if is_on_road:
                travel_cost = 0.5  # secure trade trail
                
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
            
    # 5.5. Generate Settlement Layouts
    from .settlement_layout import generate_settlement_layout
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
