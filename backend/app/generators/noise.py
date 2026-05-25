import numpy as np
import hashlib

def seed_from_string(seed_str: str) -> int:
    """
    Deterministically converts a string seed into a 32-bit integer.
    Avoids Python's built-in hash() which is randomized per process.
    """
    digest = hashlib.sha256(seed_str.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], byteorder="big")

class PerlinNoise:
    def __init__(self, seed_str: str):
        self.seed = seed_from_string(seed_str)
        # Use numpy.random.default_rng with our stable seed for absolute determinism
        rng = np.random.default_rng(self.seed)
        
        # Build deterministic permutation table
        p = np.arange(256, dtype=int)
        rng.shuffle(p)
        self.p = np.concatenate([p, p])

    def generate_2d(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        """
        Calculates Perlin noise values for 2D grids represented by x and y.
        """
        # Find unit grid cell containing point
        X = x.astype(int) & 255
        Y = y.astype(int) & 255
        
        # Get relative xy coordinates of point within that cell
        xf = x - np.floor(x)
        yf = y - np.floor(y)
        
        # Compute fade curves
        u = self.fade(xf)
        v = self.fade(yf)
        
        # Hash coordinates of the 4 square corners
        A = self.p[X] + Y
        AA = self.p[A]
        AB = self.p[A + 1]
        B = self.p[X + 1] + Y
        BA = self.p[B]
        BB = self.p[B + 1]
        
        # Add blended results from 4 corners
        res = self.lerp(v, 
                 self.lerp(u, self.grad(self.p[AA], xf, yf), self.grad(self.p[BA], xf - 1, yf)),
                 self.lerp(u, self.grad(self.p[AB], xf, yf - 1), self.grad(self.p[BB], xf - 1, yf - 1)))
        
        return res

    @staticmethod
    def fade(t: np.ndarray) -> np.ndarray:
        return t * t * t * (t * (t * 6 - 15) + 10)

    @staticmethod
    def lerp(t: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return a + t * (b - a)

    @staticmethod
    def grad(hash_code: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        h = hash_code & 15
        u = np.where(h < 8, x, y)
        v = np.where(h < 4, y, np.where((h == 12) | (h == 14), x, 0.0))
        return np.where((h & 1) == 0, u, -u) + np.where((h & 2) == 0, v, -v)

    def fBm(self, width: int, height: int, scale: float, octaves: int = 6, persistence: float = 0.5, lacunarity: float = 2.0, offset_x: float = 0.0, offset_y: float = 0.0) -> np.ndarray:
        """
        Fractal Brownian Motion (fBm) combining multiple octaves of Perlin noise.
        """
        lin_x = np.linspace(offset_x, offset_x + width * scale, width, endpoint=False)
        lin_y = np.linspace(offset_y, offset_y + height * scale, height, endpoint=False)
        x, y = np.meshgrid(lin_x, lin_y)
        
        total = np.zeros((height, width), dtype=float)
        amplitude = 1.0
        frequency = 1.0
        max_value = 0.0
        
        for _ in range(octaves):
            noise_val = self.generate_2d(x * frequency, y * frequency)
            total += noise_val * amplitude
            max_value += amplitude
            
            amplitude *= persistence
            frequency *= lacunarity
            
        # Normalize to 0.0 - 1.0 range
        return (total / max_value + 1.0) / 2.0
