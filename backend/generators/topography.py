import numpy as np
import random
from typing import List, Dict, Any, Tuple
from core.config import SEA_LEVEL, BIOMES
from .noise import PerlinNoise

def allocate_biomes(elevation: np.ndarray, moisture: np.ndarray) -> np.ndarray:
    """
    Maps height and moisture arrays to a high-contrast biome map.
    """
    height, width = elevation.shape
    biomes = np.empty((height, width), dtype=object)
    
    # Oceans and Beaches
    biomes[elevation < SEA_LEVEL * 0.75] = BIOMES["DEEP_OCEAN"]
    biomes[(elevation >= SEA_LEVEL * 0.75) & (elevation < SEA_LEVEL)] = BIOMES["OCEAN"]
    biomes[(elevation >= SEA_LEVEL) & (elevation < SEA_LEVEL + 0.04)] = BIOMES["BEACH"]
    
    # Landmass rules based on height and moisture
    land_mask = elevation >= SEA_LEVEL + 0.04
    
    # Plaines / Forests (Lowlands)
    lowland = land_mask & (elevation < 0.65)
    biomes[lowland & (moisture < 0.4)] = BIOMES["PLAINS"]
    biomes[lowland & (moisture >= 0.4)] = BIOMES["FOREST"]
    
    # Hills (Midlands)
    midland = land_mask & (elevation >= 0.65) & (elevation < 0.8)
    biomes[midland & (moisture < 0.5)] = BIOMES["HILLS"]
    biomes[midland & (moisture >= 0.5)] = BIOMES["FOREST"] # Dense elevated forests
    
    # Mountains & Glaciers (Highlands)
    highland = land_mask & (elevation >= 0.8)
    biomes[highland & (elevation < 0.9)] = BIOMES["MOUNTAINS"]
    biomes[highland & (elevation >= 0.9)] = BIOMES["GLACIERS"]
    
    return biomes

def route_rivers(elevation: np.ndarray, num_sources: int = 12) -> Tuple[List[Dict[str, Any]], np.ndarray]:
    """
    Upstream-downstream River Routing.
    Traces paths of steepest descent and calculates cumulative flow.
    """
    height, width = elevation.shape
    rivers = []
    
    # Track flow accumulation (how much water passes through each cell)
    flow_map = np.zeros((height, width), dtype=int)
    
    # Find potential sources in mountains
    mountain_coords = np.argwhere((elevation > 0.8) & (elevation < 0.95))
    if len(mountain_coords) == 0:
        return rivers, flow_map
        
    np.random.shuffle(mountain_coords)
    sources = mountain_coords[:num_sources]
    
    for rid, source in enumerate(sources):
        y, x = int(source[0]), int(source[1])
        path = [{"x": x, "y": y}]
        visited = set([(x, y)])
        current_flow = 1
        flow_map[y, x] += current_flow
        
        while True:
            if elevation[y, x] < SEA_LEVEL:
                break # Reached the sea
                
            best_neighbor = None
            lowest_elev = elevation[y, x]
            
            # Find steepest descent
            for dy, dx in [(-1,0), (1,0), (0,-1), (0,1), (-1,-1), (-1,1), (1,-1), (1,1)]:
                ny, nx = y + dy, x + dx
                if 0 <= ny < height and 0 <= nx < width and (nx, ny) not in visited:
                    if elevation[ny, nx] < lowest_elev:
                        lowest_elev = elevation[ny, nx]
                        best_neighbor = (nx, ny)
                        
            if best_neighbor:
                x, y = best_neighbor
                path.append({"x": x, "y": y})
                visited.add((x, y))
                
                # Flow accumulates downstream
                current_flow += 1
                flow_map[y, x] += current_flow
            else:
                # Local minima (lake/pit) - stop
                break
                
        if len(path) > 5:
            rivers.append({"id": rid, "path": path, "max_flow": current_flow})
            
    return rivers, flow_map

def calculate_hillshade(elevation: np.ndarray) -> np.ndarray:
    """
    Computes a Hillshade scalar by taking the cross-product/gradient 
    between adjacent cell elevations to render 3D-style map reliefs.
    """
    # Simple discrete gradient (difference between neighbors)
    dx, dy = np.gradient(elevation)
    
    # Define a light source vector (e.g., coming from North-West, top-left)
    # Normalized light vector: L = [-1, -1, 1] / sqrt(3)
    Lx, Ly, Lz = -0.577, -0.577, 0.577
    
    # Surface normal vector for the gradient field: N = [-dx, -dy, 1]
    # We compute the dot product: Dot(N, L) = -dx*Lx - dy*Ly + 1*Lz
    # Divided by the magnitude of N to normalize
    mag_N = np.sqrt(dx**2 + dy**2 + 1.0)
    
    dot_product = (-dx * Lx - dy * Ly + Lz) / mag_N
    
    # Normalize result to [0, 1] bounds for frontend scaling
    dot_min, dot_max = dot_product.min(), dot_product.max()
    if dot_max > dot_min:
        dot_product = (dot_product - dot_min) / (dot_max - dot_min)
        
    return dot_product

def process_topography(elevation: np.ndarray, seed_int: int) -> Tuple[np.ndarray, List[Dict[str, Any]], np.ndarray]:
    """
    Runs the full topographical pipeline.
    """
    height, width = elevation.shape
    noise_gen = PerlinNoise(seed_int + 100) # Offset seed for moisture
    
    # Generate moisture map
    moisture = noise_gen.fbm(width, height, scale=0.02, octaves=4, persistence=0.5, lacunarity=2.0)
    
    biomes = allocate_biomes(elevation, moisture)
    rivers, _ = route_rivers(elevation)
    hillshade = calculate_hillshade(elevation)
    
    return biomes, rivers, hillshade
