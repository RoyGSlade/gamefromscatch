import numpy as np
from .noise import PerlinNoise

def generate_terrain(width: int, height: int, seed_str: str):
    """
    Generates deterministic elevation, moisture, temperature, biomes, and hillshade for a 128x128 slice.
    """
    noise = PerlinNoise(seed_str)
    
    # 1. Coordinate Grid
    y_coords, x_coords = np.meshgrid(np.arange(height), np.arange(width), indexing="ij")
    
    # 2. Coordinate Grid & Perturbed Coordinate Distance (Tectonic/Organic shape)
    # Normalize coordinates to -0.5 to 0.5
    nx_base = (x_coords / (width - 1)) - 0.5
    ny_base = (y_coords / (height - 1)) - 0.5
    
    # We use Perlin noise to perturb the coordinates to break perfect radial symmetry
    # Keep the perturbation moderate so the main continent remains contiguous and ocean-free routes are findable
    scale_perturb = 0.025
    noise_offset_x = noise.generate_2d(x_coords * scale_perturb, y_coords * scale_perturb) * 0.05
    noise_offset_y = noise.generate_2d(x_coords * scale_perturb + 150.0, y_coords * scale_perturb + 150.0) * 0.05
    
    nx = nx_base + noise_offset_x
    ny = ny_base + noise_offset_y
    d = np.sqrt(nx**2 + ny**2) * 2.0  # 0 at center, 1+ at boundaries
    
    # 3. Organic Mask: Replace strict radial mask with a noise-modulated coordinate mask (highly organic, natural, and non-circular)
    # We generate a noise field specifically for the boundary modulation
    boundary_noise = noise.fBm(width, height, scale=0.015, octaves=3, persistence=0.5, lacunarity=2.0, offset_x=1200.0, offset_y=1200.0)
    # Modulate the distance threshold organically: base of 0.8 modulated by ±0.15 based on noise
    mask_threshold = 0.8 + 0.15 * (boundary_noise - 0.5) * 2.0
    organic_mask = np.clip(1.0 - (d / mask_threshold) ** 2, 0.0, 1.0)
    
    # 3. Base Terrain fBm Noise
    base_elevation = noise.fBm(width, height, scale=0.012, octaves=5, persistence=0.5, lacunarity=2.1)
    
    # 4. Geological Mountain Folding / Ridge Noise
    # Generate multi-octave ridge noise: 1 - |noise|, then squared to make valleys flat and ridges sharp
    lin_x = np.linspace(200.0, 200.0 + width * 0.025, width, endpoint=False)
    lin_y = np.linspace(200.0, 200.0 + height * 0.025, height, endpoint=False)
    rx, ry = np.meshgrid(lin_x, lin_y)
    
    ridge_total = np.zeros((height, width), dtype=float)
    amplitude = 1.0
    frequency = 1.0
    max_value = 0.0
    
    for _ in range(4):
        n_val = noise.generate_2d(rx * frequency, ry * frequency)
        r_val = 1.0 - np.abs(n_val)
        r_val = r_val * r_val  # sharpen the ridges
        ridge_total += r_val * amplitude
        max_value += amplitude
        
        amplitude *= 0.5
        frequency *= 2.1
        
    ridge_noise = ridge_total / max_value
    
    # 5. Mountain Belt Mask (Folding tectonic fault lines)
    belt_noise = noise.fBm(width, height, scale=0.009, octaves=2, persistence=0.5, lacunarity=2.0, offset_x=300.0, offset_y=300.0)
    belt_mask = np.clip(1.0 - np.abs(belt_noise - 0.5) / 0.12, 0.0, 1.0)
    belt_mask = belt_mask * belt_mask  # smooth transition
    
    # Blend base elevation with mountain ridges along the tectonic belts, and apply our organic mask
    combined = base_elevation * 0.7 + ridge_noise * 0.35 * belt_mask
    elevation = combined * organic_mask
    
    # Normalize elevation after masking to ensure peaks rise up deterministically to a beautiful maximum (0.95)
    e_min, e_max = elevation.min(), elevation.max()
    if e_max > e_min:
        elevation = (elevation - e_min) / (e_max - e_min) * 0.95
    
    # 3. Moisture fBm (with 1000.0 offset to differentiate from elevation)
    moisture = noise.fBm(width, height, scale=0.015, octaves=4, persistence=0.5, lacunarity=2.0, offset_x=1000.0, offset_y=1000.0)
    
    # 4. Temperature (latitude based + noise with 500.0 offset)
    # y=0 is north (cold), y=127 is south (warm)
    lat_factor = y_coords / (height - 1)
    temp_noise = noise.fBm(width, height, scale=0.03, octaves=3, persistence=0.4, lacunarity=2.0, offset_x=500.0, offset_y=500.0)
    temperature = np.clip(0.2 * lat_factor + 0.8 * temp_noise, 0.0, 1.0)
    
    # 5. Hillshade (using terrain gradients)
    # np.gradient returns dy, dx
    dy, dx = np.gradient(elevation * 15.0)  # scale elevation to emphasize slopes
    
    # Normal vector components N = (-dx, -dy, 1)
    norm = np.sqrt(dx**2 + dy**2 + 1.0)
    nx_vals = -dx / norm
    ny_vals = -dy / norm
    nz_vals = 1.0 / norm
    
    # Light vector from top-left (dx = -1, dy = -1, dz = 1)
    lx, ly, lz = -1.0, -1.0, 1.0
    l_norm = np.sqrt(lx**2 + ly**2 + lz**2)
    lx /= l_norm
    ly /= l_norm
    lz /= l_norm
    
    # Dot product of normal and light vector
    dot = nx_vals * lx + ny_vals * ly + nz_vals * lz
    # Normalize to [0, 1] range
    hillshade = (dot + 1.0) / 2.0
    
    # 6. Biome assignment
    biomes = np.empty((height, width), dtype=object)
    
    # Define sea level threshold
    sea_level = 0.45
    
    for y in range(height):
        for x in range(width):
            elev = elevation[y, x]
            mist = moisture[y, x]
            temp = temperature[y, x]
            
            if elev < 0.38:
                biomes[y, x] = "Deep Ocean"
            elif elev < sea_level:
                biomes[y, x] = "Shallow Ocean"
            else:
                # Land biomes
                # Check if coastal (adjacent to ocean)
                is_coast = False
                for dy_offset in [-1, 0, 1]:
                    for dx_offset in [-1, 0, 1]:
                        ny_idx, nx_idx = y + dy_offset, x + dx_offset
                        if 0 <= ny_idx < height and 0 <= nx_idx < width:
                            if elevation[ny_idx, nx_idx] < sea_level:
                                is_coast = True
                
                if is_coast and elev < sea_level + 0.02:
                    biomes[y, x] = "Coastal Beach"
                elif elev >= 0.86:
                    biomes[y, x] = "Frozen Peaks"
                elif elev >= 0.76:
                    biomes[y, x] = "Craggy Peaks"
                elif elev >= 0.62:
                    biomes[y, x] = "Rolling Hills"
                else:
                    # Lowland biomes depending on temp & moisture
                    if mist < 0.28:
                        biomes[y, x] = "Arid Desert"
                    elif mist >= 0.72 and temp >= 0.55 and elev < 0.52:
                        biomes[y, x] = "Murky Swamp"
                    elif mist >= 0.55:
                        if temp < 0.38:
                            biomes[y, x] = "Taiga / Boreal"
                        else:
                            biomes[y, x] = "Dense Forest"
                    else:
                        biomes[y, x] = "Lush Plains"
                        
    return {
        "elevation": elevation,
        "moisture": moisture,
        "temperature": temperature,
        "hillshade": hillshade,
        "biomes": biomes,
        "sea_level": sea_level
    }
