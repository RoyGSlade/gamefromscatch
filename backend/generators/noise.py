import numpy as np

class PerlinNoise:
    def __init__(self, seed: int):
        self.seed = seed
        np.random.seed(seed)
        
        # Create permutation table
        p = np.arange(256, dtype=int)
        np.random.shuffle(p)
        self.p = np.stack([p, p]).flatten()

    def generate_2d(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        """
        Generates 2D Perlin noise for grid coordinate arrays x and y.
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
        
        # Return scaled to roughly -1 to 1
        return res

    @staticmethod
    def fade(t: np.ndarray) -> np.ndarray:
        return t * t * t * (t * (t * 6 - 15) + 10)

    @staticmethod
    def lerp(t: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return a + t * (b - a)

    @staticmethod
    def grad(hash: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        h = hash & 15
        u = np.where(h < 8, x, y)
        v = np.where(h < 4, y, np.where((h == 12) | (h == 14), x, 0.0))
        return np.where((h & 1) == 0, u, -u) + np.where((h & 2) == 0, v, -v)

    def fbm(self, width: int, height: int, scale: float, octaves: int = 6, persistence: float = 0.5, lacunarity: float = 2.0, octave_weights: list = None) -> np.ndarray:
        """
        Fractal Brownian Motion (fBm)
        """
        lin_x = np.linspace(0, width * scale, width, endpoint=False)
        lin_y = np.linspace(0, height * scale, height, endpoint=False)
        x, y = np.meshgrid(lin_x, lin_y)
        
        total = np.zeros((height, width), dtype=float)
        amplitude = 1.0
        frequency = 1.0
        max_value = 0.0
        
        for i in range(octaves):
            weight = octave_weights[i] if octave_weights and i < len(octave_weights) else 1.0
            
            # Generate noise for current octave
            noise_val = self.generate_2d(x * frequency, y * frequency)
            
            total += noise_val * amplitude * weight
            max_value += amplitude * weight
            
            amplitude *= persistence
            frequency *= lacunarity
            
        # Normalize to 0.0 - 1.0 range
        return (total / max_value + 1.0) / 2.0
