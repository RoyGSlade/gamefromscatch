/**
 * noise.js - Seedable PRNG and Perlin Noise Engine
 * Handles deterministic generation of heights, moisture, and city attributes.
 */

// Simple, fast seedable random generator (Mulberry32)
export function createPRNG(seedString) {
    // Generate a numeric seed from a string
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedString.length; i++) {
        h = Math.imul(h ^ seedString.charCodeAt(i), 16777619);
    }
    
    let a = h >>> 0;
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class PerlinNoise {
    constructor(seedString) {
        this.rng = createPRNG(seedString);
        this.p = new Uint8Array(512);
        this.permutation = new Uint8Array(256);
        
        // Populate permutation
        for (let i = 0; i < 256; i++) {
            this.permutation[i] = i;
        }
        
        // Shuffle permutation deterministically
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(this.rng() * (i + 1));
            const tmp = this.permutation[i];
            this.permutation[i] = this.permutation[j];
            this.permutation[j] = tmp;
        }
        
        // Double the permutation array to avoid overflow bounds checking
        for (let i = 0; i < 512; i++) {
            this.p[i] = this.permutation[i & 255];
        }
    }

    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    lerp(t, a, b) {
        return a + t * (b - a);
    }

    grad(hash, x, y) {
        // Convert low 3 bits of hash code into 8 gradient directions
        const h = hash & 7;
        const u = h < 4 ? x : y;
        const v = h < 4 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -2.0 * v : 2.0 * v);
    }

    noise2D(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);

        const u = this.fade(x);
        const v = this.fade(y);

        const A = this.p[X] + Y;
        const B = this.p[X + 1] + Y;

        return this.lerp(v, 
            this.lerp(u, this.grad(this.p[A], x, y), 
                         this.grad(this.p[B], x - 1, y)),
            this.lerp(u, this.grad(this.p[A + 1], x, y - 1), 
                         this.grad(this.p[B + 1], x - 1, y - 1))
        );
    }

    /**
     * Fractal Brownian Motion (fBm) - Multi-octave noise summing
     */
    fBm(x, y, octaves = 6, persistence = 0.5, lacunarity = 2.0) {
        let total = 0;
        let frequency = 1.0;
        let amplitude = 1.0;
        let maxValue = 0; // Used for normalizing

        for (let i = 0; i < octaves; i++) {
            total += this.noise2D(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        // Return normalized value between -1 and 1, then mapped to 0 to 1
        return (total / maxValue + 1) / 2;
    }
}
