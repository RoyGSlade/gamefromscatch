import numpy as np
import random
from scipy.ndimage import gaussian_filter
from .noise import PerlinNoise
from core.config import SEA_LEVEL

def generate_continents(width: int, height: int, seed_string: str) -> np.ndarray:
    """
    Multi-Node Tectonic Continent Generator
    Spawns continent seeds and expands them using fBm noise.
    """
    # Create numeric seed
    seed_int = sum(ord(c) for c in seed_string)
    np.random.seed(seed_int)
    random.seed(seed_int)
    
    noise_gen = PerlinNoise(seed_int)
    
    # Base oceanic plate
    elevation = np.full((height, width), SEA_LEVEL - 0.2, dtype=float)
    
    # Spawn 3 to 5 landmass seeds
    num_seeds = random.randint(3, 5)
    seeds = []
    for _ in range(num_seeds):
        # Keep away from very edges
        x = random.randint(width // 5, 4 * width // 5)
        y = random.randint(height // 5, 4 * height // 5)
        seeds.append((x, y))
        elevation[y, x] = 1.0 # High peak
        
    # Diffuse seeds to create basic continent blobs
    # The larger the sigma, the larger the continents
    sigma = min(width, height) / 8.0
    base_continents = gaussian_filter(elevation, sigma=sigma)
    
    # Normalize blob heights
    b_min, b_max = base_continents.min(), base_continents.max()
    if b_max > b_min:
        base_continents = (base_continents - b_min) / (b_max - b_min)
        
    # Generate structural fBm noise to multiply against the blobs
    # This creates jagged coastlines and varied internal topology
    structural_noise = noise_gen.fbm(
        width, height, 
        scale=0.015, 
        octaves=6, 
        persistence=0.45, 
        lacunarity=2.2
    )
    
    # Combine the tectonic blobs with the structural noise
    # We use a mix of multiplication (masks out oceans) and addition (adds internal mountains)
    final_elevation = (base_continents * 0.6) + (structural_noise * 0.45)
    
    # Flatten deep oceans to create distinct channels
    final_elevation[final_elevation < SEA_LEVEL * 0.6] = SEA_LEVEL * 0.6
    
    # Normalize to [0, 1] range to be safe
    f_min, f_max = final_elevation.min(), final_elevation.max()
    if f_max > f_min:
        final_elevation = (final_elevation - f_min) / (f_max - f_min)
        
    return final_elevation
