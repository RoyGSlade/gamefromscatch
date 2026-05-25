/**
 * world.js - Procedural World Generator
 * Creates the global map grid, elevation, biomes, countries, rivers, and city nodes.
 */
import { PerlinNoise, createPRNG } from './noise.js';

export const BIOMES = {
    DEEP_OCEAN: { name: 'Deep Ocean', color: '#001f3f', colorAntique: '#cfc0a5', isWater: true },
    SHALLOW_OCEAN: { name: 'Shallow Ocean', color: '#0074D9', colorAntique: '#decfa6', isWater: true },
    BEACH: { name: 'Coastal Beach', color: '#E9DCC9', colorAntique: '#e3d2ac', isWater: false }, 
    DESERT: { name: 'Arid Desert', color: '#E2C275', colorAntique: '#e4d2a3', isWater: false },
    PLAINS: { name: 'Lush Plains', color: '#F4F1DE', colorAntique: '#d1c099', isWater: false },
    FOREST: { name: 'Dense Forest', color: '#2ca02c', colorAntique: '#c1b088', isWater: false },
    BOREAL: { name: 'Taiga / Boreal', color: '#1e7b1e', colorAntique: '#b8a880', isWater: false },
    SWAMP: { name: 'Murky Swamp', color: '#4A5D23', colorAntique: '#b5a57d', isWater: false },
    HILLS: { name: 'Rolling Hills', color: '#A4B07E', colorAntique: '#c2b38c', isWater: false },
    MOUNTAIN: { name: 'Craggy Peaks', color: '#888888', colorAntique: '#a49572', isWater: false },
    GLACIER: { name: 'Frozen Peaks', color: '#FFFFFF', colorAntique: '#e7d8b5', isWater: false }
};

export const TRADE_GOODS = ['Grain', 'Timber', 'Iron Ore', 'Gold', 'Fish', 'Spices', 'Wine', 'Horses', 'Wool', 'Stone'];

const COUNTRY_PREFIXES = ['Kingdom of', 'Empire of', 'Duchy of', 'Principality of', 'Republic of', 'Sultanate of', 'High Realm of'];
const LAND_SYLLABLES_PRE = ['Eld', 'Val', 'Krag', 'Oakh', 'Storm', 'River', 'Deep', 'High', 'Stone', 'Gold', 'Iron', 'Sol', 'Wind', 'Aethel', 'Dun', 'Glen', 'Lox', 'Roth', 'Dread', 'Bryn'];
const LAND_SYLLABLES_MID = ['en', 'or', 'an', 'el', 'is', 'ar', 'al', 'on', 'ur', 'i', 'a', 'o', 'u', 'e'];
const LAND_SYLLABLES_SUF = ['ia', 'hold', 'run', 'haven', 'fell', 'wood', 'gard', 'ford', 'wall', 'crag', 'reach', 'shire', 'vale', 'port', 'bay', 'crest', 'peak', 'fast', 'keep', 'marsh'];

export function generateName(rng) {
    const pre = LAND_SYLLABLES_PRE[Math.floor(rng() * LAND_SYLLABLES_PRE.length)];
    const suf = LAND_SYLLABLES_SUF[Math.floor(rng() * LAND_SYLLABLES_SUF.length)];
    if (rng() > 0.4) {
        const mid = LAND_SYLLABLES_MID[Math.floor(rng() * LAND_SYLLABLES_MID.length)];
        return pre + mid + suf;
    }
    return pre + suf;
}

export class WorldMap {
    constructor(width = 256, height = 256, seed = 'Eldoria') {
        this.width = width;
        this.height = height;
        this.seed = seed;
        this.rng = createPRNG(seed);
        
        this.noise = new PerlinNoise(seed);
        this.grid = new Array(width * height);
        this.countries = [];
        this.cities = [];
        this.rivers = [];
        
        this.seaLevel = 0.43;
    }

    getCell(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
        return this.grid[y * this.width + x];
    }

    generate(numCountries = 6, numCities = 32) {
        const w = this.width;
        const h = this.height;

        // 1. Generate heightmap & moisture
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                // Normalized coordinates
                const nx = x / w - 0.5;
                const ny = y / h - 0.5;
                
                // Radial gradient to force islands / circular landmasses
                const d = Math.sqrt(nx * nx + ny * ny) * 2.0; // 0 at center, 1+ at corners
                const radialMask = Math.max(0, 1.0 - d * d * 1.3);

                // Multi-scale noise for jagged islands
                const elevationNoise = this.noise.fBm(x * 0.007, y * 0.007, 6, 0.48, 2.1);
                
                // Combine and apply mask
                let elevation = elevationNoise * radialMask;
                
                // Add a small global modifier to create tiny archipelagos
                if (elevation < this.seaLevel) {
                    elevation += this.noise.noise2D(x * 0.03, y * 0.03) * 0.02;
                }

                // Moisture map (independent noise, slightly affected by proximity to ocean/center)
                let moisture = this.noise.fBm(x * 0.012 + 100, y * 0.012 + 100, 4, 0.5, 2.0);
                moisture = moisture * (1.0 - Math.abs(elevation - this.seaLevel) * 0.5);

                const cell = {
                    x, y,
                    elevation,
                    moisture,
                    biome: null,
                    countryId: -1,
                    riverId: -1,
                    isCoast: false,
                    riverFlow: 0
                };
                
                this.grid[y * w + x] = cell;
            }
        }

        // 2. Identify Coasts and assign Biomes
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const cell = this.getCell(x, y);
                
                // Determine biome based on height & moisture
                if (cell.elevation < this.seaLevel * 0.6) {
                    cell.biome = BIOMES.DEEP_OCEAN;
                } else if (cell.elevation < this.seaLevel) {
                    cell.biome = BIOMES.SHALLOW_OCEAN;
                } else {
                    // Check if adjacent to ocean
                    let isCoast = false;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const neighbor = this.getCell(x + dx, y + dy);
                            if (neighbor && neighbor.elevation < this.seaLevel) {
                                isCoast = true;
                            }
                        }
                    }
                    cell.isCoast = isCoast;

                    if (isCoast && cell.elevation < this.seaLevel + 0.02) {
                        cell.biome = BIOMES.BEACH;
                    } else if (cell.elevation > 0.78) {
                        cell.biome = BIOMES.GLACIER;
                    } else if (cell.elevation > 0.68) {
                        cell.biome = BIOMES.MOUNTAIN;
                    } else if (cell.elevation > 0.58) {
                        cell.biome = BIOMES.HILLS;
                    } else {
                        // Temperature/Moisture matrices
                        if (cell.moisture < 0.3) {
                            cell.biome = BIOMES.DESERT;
                        } else if (cell.moisture < 0.45) {
                            cell.biome = BIOMES.PLAINS;
                        } else if (cell.moisture < 0.65) {
                            cell.biome = BIOMES.FOREST;
                        } else if (cell.moisture < 0.8) {
                            cell.biome = BIOMES.BOREAL;
                        } else {
                            cell.biome = BIOMES.SWAMP;
                        }
                    }
                }
            }
        }

        // 3. Generate Rivers
        // Place river sources in high mountains and trace paths of steepest descent
        const mountainCells = this.grid.filter(c => c.elevation > 0.62);
        const riverCount = Math.min(12, Math.floor(mountainCells.length / 40));
        
        for (let r = 0; r < riverCount; r++) {
            if (mountainCells.length === 0) break;
            const sourceIndex = Math.floor(this.rng() * mountainCells.length);
            const source = mountainCells.splice(sourceIndex, 1)[0];
            
            let current = source;
            const path = [];
            const visited = new Set();
            
            while (current && current.elevation >= this.seaLevel) {
                path.push(current);
                visited.add(`${current.x},${current.y}`);
                
                // Find neighbor with lowest elevation
                let next = null;
                let lowestElev = current.elevation;
                
                const neighbors = [
                    {x: -1, y: 0}, {x: 1, y: 0}, {x: 0, y: -1}, {x: 0, y: 1},
                    {x: -1, y: -1}, {x: 1, y: -1}, {x: -1, y: 1}, {x: 1, y: 1}
                ];
                
                for (const offset of neighbors) {
                    const n = this.getCell(current.x + offset.x, current.y + offset.y);
                    if (n && !visited.has(`${n.x},${n.y}`) && n.elevation < lowestElev) {
                        lowestElev = n.elevation;
                        next = n;
                    }
                }
                
                current = next;
            }
            
            if (path.length > 5) {
                this.rivers.push(path);
                const riverId = this.rivers.length - 1;
                path.forEach((c, idx) => {
                    c.riverId = riverId;
                    c.riverFlow = idx + 1; // flow rate increases downstream
                });
            }
        }

        // 4. Create Political Countries
        // Pick Capital seeds in fertile, low-level spots
        const landCells = this.grid.filter(c => c.elevation >= this.seaLevel && c.elevation < 0.58 && c.biome !== BIOMES.DESERT && c.biome !== BIOMES.SWAMP);
        
        if (landCells.length > 100) {
            const colors = [
                'hsl(14, 85%, 57%)',   // Warm Terracotta / Red
                'hsl(142, 50%, 45%)',  // Forest Sage / Green
                'hsl(210, 75%, 50%)',  // Royal Indigo / Blue
                'hsl(42, 85%, 50%)',   // Golden Mustard / Gold
                'hsl(280, 60%, 55%)',  // Deep Amethyst / Purple
                'hsl(180, 55%, 45%)',  // Teal Jade / Cyan
                'hsl(330, 70%, 55%)',  // Crimson Rose / Pink
                'hsl(35, 75%, 45%)'    // Copper Autumn / Bronze
            ];
            
            const activeCountriesCount = Math.min(numCountries, colors.length);
            
            // Selection of capitals that are distant from each other
            const capitals = [];
            let pool = [...landCells];
            
            for (let i = 0; i < activeCountriesCount; i++) {
                if (pool.length === 0) break;
                // Pick a candidate
                let bestIdx = 0;
                let maxDist = -1;
                
                // Try 10 random picks and choose the one furthest from other capitals
                for (let attempt = 0; attempt < 10; attempt++) {
                    const rndIdx = Math.floor(this.rng() * pool.length);
                    const candidate = pool[rndIdx];
                    
                    if (capitals.length === 0) {
                        bestIdx = rndIdx;
                        break;
                    }
                    
                    let minDist = Infinity;
                    for (const cap of capitals) {
                        const dist = Math.hypot(candidate.x - cap.x, candidate.y - cap.y);
                        if (dist < minDist) minDist = dist;
                    }
                    
                    if (minDist > maxDist) {
                        maxDist = minDist;
                        bestIdx = rndIdx;
                    }
                }
                
                const capitalCell = pool.splice(bestIdx, 1)[0];
                capitals.push(capitalCell);
            }

            // Expand territory around capitals using BFS flood fill
            const queues = capitals.map((cap, id) => {
                cap.countryId = id;
                return [{ cell: cap, cost: 0 }];
            });

            const maxExpansionRadius = w * 0.35;
            let cellsClaimed = true;
            
            while (cellsClaimed) {
                cellsClaimed = false;
                
                for (let id = 0; id < capitals.length; id++) {
                    const q = queues[id];
                    if (q.length === 0) continue;
                    
                    // Sort queue by expansion cost to grow organically
                    q.sort((a, b) => a.cost - b.cost);
                    const { cell, cost } = q.shift();
                    
                    const neighbors = [
                        {x: -1, y: 0}, {x: 1, y: 0}, {x: 0, y: -1}, {x: 0, y: 1}
                    ];
                    
                    for (const offset of neighbors) {
                        const nx = cell.x + offset.x;
                        const ny = cell.y + offset.y;
                        const n = this.getCell(nx, ny);
                        
                        if (n && n.elevation >= this.seaLevel && n.countryId === -1) {
                            // Calculate crossing cost based on mountains/rivers
                            let terrainCost = 1.0;
                            if (n.biome === BIOMES.MOUNTAIN) terrainCost = 6.0;
                            if (n.biome === BIOMES.HILLS) terrainCost = 2.5;
                            if (n.biome === BIOMES.SWAMP) terrainCost = 4.0;
                            if (n.riverId !== -1) terrainCost = 1.8; // harder to cross rivers
                            
                            const totalCost = cost + terrainCost;
                            const distanceToCapital = Math.hypot(nx - capitals[id].x, ny - capitals[id].y);
                            
                            if (distanceToCapital < maxExpansionRadius) {
                                n.countryId = id;
                                q.push({ cell: n, cost: totalCost });
                                cellsClaimed = true;
                            }
                        }
                    }
                }
            }

            // Create Country Objects
            for (let id = 0; id < capitals.length; id++) {
                const cap = capitals[id];
                const countryPrefix = COUNTRY_PREFIXES[Math.floor(this.rng() * COUNTRY_PREFIXES.length)];
                const countryBaseName = generateName(this.rng);
                const countryName = `${countryPrefix} ${countryBaseName}`;
                
                const country = {
                    id,
                    name: countryName,
                    baseName: countryBaseName,
                    color: colors[id],
                    capitalX: cap.x,
                    capitalY: cap.y,
                    capitalName: generateName(this.rng) + ' Keep',
                    cellsCount: this.grid.filter(c => c.countryId === id).length
                };
                
                this.countries.push(country);
                
                // Add capital city node
                const capitalCity = {
                    x: cap.x,
                    y: cap.y,
                    name: country.capitalName,
                    isCapital: true,
                    countryId: id,
                    population: Math.floor(45000 + this.rng() * 35000),
                    biome: cap.biome.name,
                    isCoastal: cap.isCoast,
                    hasRiver: cap.riverId !== -1,
                    tradeGoods: [TRADE_GOODS[Math.floor(this.rng() * 4)], TRADE_GOODS[Math.floor(this.rng() * 6) + 4]],
                    seed: `city_${id}_${country.capitalName}_capital`,
                    ruler: `Grand Sovereign ${generateName(this.rng)}`,
                    lore: `The historic administrative center and royal seat of the ${country.baseName}. Known for its grand spires and bustling markets.`
                };
                
                this.cities.push(capitalCity);
            }
        }

        // 5. Generate Minor Cities
        // Distribute cities across other land cells, prioritizing coastal beaches, rivers, forests
        const possibleCityCells = this.grid.filter(c => {
            if (c.elevation < this.seaLevel || c.biome === BIOMES.MOUNTAIN || c.biome === BIOMES.GLACIER) return false;
            // Ensure not too close to existing cities
            for (const city of this.cities) {
                if (Math.hypot(c.x - city.x, c.y - city.y) < 14) return false;
            }
            return true;
        });

        // Sort by suitability (riverbanks and coasts are ideal)
        possibleCityCells.sort((a, b) => {
            let scoreA = 0;
            let scoreB = 0;
            
            if (a.isCoast) scoreA += 10;
            if (a.riverId !== -1) scoreA += 8;
            if (a.biome === BIOMES.PLAINS) scoreA += 5;
            if (a.biome === BIOMES.FOREST) scoreA += 3;
            
            if (b.isCoast) scoreB += 10;
            if (b.riverId !== -1) scoreB += 8;
            if (b.biome === BIOMES.PLAINS) scoreB += 5;
            if (b.biome === BIOMES.FOREST) scoreB += 3;
            
            return scoreB - scoreA; // Descending
        });

        const activeCitiesCount = Math.min(numCities - this.cities.length, possibleCityCells.length);
        
        for (let i = 0; i < activeCitiesCount; i++) {
            const cell = possibleCityCells[i];
            const cityName = generateName(this.rng);
            
            // Random goods
            const goods = [];
            while (goods.length < 2) {
                const g = TRADE_GOODS[Math.floor(this.rng() * TRADE_GOODS.length)];
                if (!goods.includes(g)) goods.push(g);
            }

            const rNames = ['Baron', 'Duke', 'Earl', 'Countess', 'Margrave', 'Lord Regent'];
            const rulerName = `${rNames[Math.floor(this.rng() * rNames.length)]} ${generateName(this.rng)}`;
            
            const city = {
                x: cell.x,
                y: cell.y,
                name: cityName,
                isCapital: false,
                countryId: cell.countryId,
                population: Math.floor(6000 + this.rng() * 22000),
                biome: cell.biome.name,
                isCoastal: cell.isCoast,
                hasRiver: cell.riverId !== -1,
                tradeGoods: goods,
                seed: `city_${cell.countryId}_${cityName}_minor_${i}`,
                ruler: rulerName,
                lore: `A prosperous regional settlement nestled in the local ${cell.biome.name.toLowerCase()} region. Famous for producing high quality ${goods.join(' and ')}.`
            };
            
            this.cities.push(city);
        }
    }
}
