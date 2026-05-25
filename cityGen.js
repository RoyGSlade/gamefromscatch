/**
 * cityGen.js - Causality-Driven Procedural City Generator
 * Replaces city.js. Uses geographic causality (rivers, coasts) to generate
 * L-system streets, districts, and explicitly defined RPG buildings.
 */
import { createPRNG } from './noise.js';

export class CityPlanner {
    constructor(cityData) {
        this.cityData = cityData;
        this.rng = createPRNG(cityData.seed || 'city_0');
        this.isCapital = cityData.isCapital || false;
        
        // Causality flags
        this.isCoastal = cityData.isCoastal || false;
        this.hasRiver = cityData.hasRiver || false;
        
        this.width = 1000;
        this.height = 1000;
        
        this.streets = [];
        this.buildings = []; // explicit objects with RPG data
        this.wallPoints = [];
        this.castle = null;
        this.rivers = [];
        this.docks = [];
        this.citizens = []; // for animated dots
        
        this.generate();
    }

    generate() {
        this.generateGeography();
        
        // Center keep
        this.castle = {
            x: this.width * 0.5,
            y: this.height * 0.45,
            radius: this.isCapital ? 45 : 30,
            towersCount: this.isCapital ? 6 : 4
        };

        // Seed some main roads
        this.streets.push({
            width: 8,
            points: [
                {x: this.castle.x, y: this.castle.y + this.castle.radius},
                {x: this.castle.x, y: this.castle.y + 250},
                {x: this.castle.x - 150, y: this.castle.y + 400}
            ]
        });

        // Use organic L-system-like branch generation for streets
        this.generateOrganicStreets();

        // City Walls based on population/capital
        if (this.isCapital || this.rng() > 0.3) {
            this.generateWalls();
        }

        // Place buildings along streets
        this.generateDistrictsAndBuildings();
        
        this.spawnCitizens();
    }

    generateGeography() {
        if (this.hasRiver) {
            // Winding river passing through the city
            const points = [];
            let currentX = this.width * 0.2 + this.rng() * 200;
            let currentY = 0;
            
            while (currentY <= this.height) {
                points.push({x: currentX, y: currentY});
                currentX += (this.rng() - 0.5) * 60;
                currentY += 50 + this.rng() * 30;
            }
            this.rivers.push({ width: 35, points });
        }
        
        if (this.isCoastal) {
            // Coastline is bottom ~28%
            const dockCount = 3 + Math.floor(this.rng() * 4);
            const waterY = this.height * 0.72;
            
            for (let i = 0; i < dockCount; i++) {
                this.docks.push({
                    x: this.width * 0.3 + (i * 120) + this.rng() * 40,
                    y: waterY,
                    w: 20 + this.rng() * 15,
                    h: 60 + this.rng() * 30
                });
            }
        }
    }

    generateOrganicStreets() {
        const branches = 40 + Math.floor(this.rng() * 40);
        
        for (let i = 0; i < branches; i++) {
            const parent = this.streets[Math.floor(this.rng() * this.streets.length)];
            const startNode = parent.points[Math.floor(this.rng() * parent.points.length)];
            
            const points = [startNode];
            let cx = startNode.x;
            let cy = startNode.y;
            
            const dirAngle = this.rng() * Math.PI * 2;
            const segments = 2 + Math.floor(this.rng() * 4);
            
            for (let s = 0; s < segments; s++) {
                cx += Math.cos(dirAngle + (this.rng() - 0.5)) * 40;
                cy += Math.sin(dirAngle + (this.rng() - 0.5)) * 40;
                points.push({x: cx, y: cy});
            }
            
            this.streets.push({ width: 3 + this.rng() * 3, points });
        }
    }

    generateWalls() {
        const radius = this.isCapital ? 400 : 250;
        const cx = this.castle.x;
        const cy = this.castle.y;
        const points = 16;
        
        for (let i = 0; i < points; i++) {
            const angle = (i / points) * Math.PI * 2;
            const r = radius + (this.rng() - 0.5) * 60;
            
            let wx = cx + Math.cos(angle) * r;
            let wy = cy + Math.sin(angle) * r;
            
            // if coastal, do not wall the water
            if (this.isCoastal && wy > this.height * 0.72) {
                wy = this.height * 0.72;
            }
            
            this.wallPoints.push({x: wx, y: wy});
        }
    }

    generateDistrictsAndBuildings() {
        // We evaluate each street segment to place houses
        const targetHouseCount = this.isCapital ? 600 : 250;
        
        // Districts mapping based on radius from keep
        // < 100: Keep / Noble
        // 100 - 250: Market / Temple
        // > 250: Residential / Slums
        // Near water/docks: Harbor
        
        for (let attempt = 0; attempt < targetHouseCount * 3; attempt++) {
            if (this.buildings.length >= targetHouseCount) break;
            
            const street = this.streets[Math.floor(this.rng() * this.streets.length)];
            const pIdx = Math.floor(this.rng() * (street.points.length - 1));
            const p1 = street.points[pIdx];
            const p2 = street.points[pIdx + 1];
            
            const t = this.rng();
            const sx = p1.x + (p2.x - p1.x) * t;
            const sy = p1.y + (p2.y - p1.y) * t;
            
            // Offset perpendicular
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const offset = (street.width / 2 + 10 + this.rng() * 10) * (this.rng() > 0.5 ? 1 : -1);
            
            const bx = sx + Math.cos(angle + Math.PI/2) * offset;
            const by = sy + Math.sin(angle + Math.PI/2) * offset;
            
            // Bounds check
            if (bx < 50 || bx > this.width - 50 || by < 50 || by > this.height - 50) continue;
            
            if (this.isCoastal && by > this.height * 0.72) continue; // In water
            
            // Distance to Keep
            const distKeep = Math.hypot(bx - this.castle.x, by - this.castle.y);
            
            // Determine District
            let district = 'Residential';
            if (distKeep < 120) district = 'Keep';
            else if (distKeep < 250) {
                district = this.rng() > 0.3 ? 'Market' : 'Temple';
            } else if (distKeep > 350) {
                district = 'Slums';
            }
            
            if (this.isCoastal && by > this.height * 0.60) district = 'Harbor';

            // Determine Purpose & RPG Stats
            let purpose = 'House';
            let obscurityRating = 0; // passive perception needed to reveal it
            let tier = 1;
            
            if (this.rng() > 0.85) {
                if (district === 'Market') {
                    const shops = ['Blacksmith', 'Apothecary', 'Tavern', 'General Store'];
                    purpose = shops[Math.floor(this.rng() * shops.length)];
                    tier = 2 + Math.floor(this.rng() * 2);
                    obscurityRating = 5;
                } else if (district === 'Harbor') {
                    purpose = this.rng() > 0.5 ? 'Fishery' : 'Smuggler Den';
                    obscurityRating = purpose === 'Smuggler Den' ? 16 : 8;
                } else if (district === 'Temple') {
                    purpose = 'Shrine';
                    tier = 3;
                    obscurityRating = 10;
                } else if (district === 'Keep') {
                    purpose = 'Noble Manor';
                    tier = 4;
                    obscurityRating = 12;
                } else if (this.hasRiver && this.rng() > 0.9) {
                    purpose = 'Watermill';
                    obscurityRating = 8;
                }
            }

            // Create explicit Building Object
            this.buildings.push({
                x: bx,
                y: by,
                w: 12 + this.rng() * 12,
                h: 12 + this.rng() * 12,
                angle: angle + (this.rng() * 0.2 - 0.1),
                district: district,
                purpose: purpose,
                tier: tier,
                priceMod: 1.0 + (tier * 0.2) + (this.rng() * 0.2 - 0.1),
                npcSeed: `npc_${this.cityData.seed}_bld_${this.buildings.length}`,
                obscurityRating: obscurityRating,
                lockedAtNight: purpose !== 'Tavern' && purpose !== 'House'
            });
        }
    }

    spawnCitizens() {
        const pop = this.isCapital ? 60 : 25;
        for (let i = 0; i < pop; i++) {
            this.citizens.push({
                x: this.castle.x + (this.rng() - 0.5) * 300,
                y: this.castle.y + (this.rng() - 0.5) * 300,
                vx: (this.rng() - 0.5) * 0.5,
                vy: (this.rng() - 0.5) * 0.5,
                color: this.rng() > 0.8 ? '#f4a261' : '#e9c46a'
            });
        }
    }

    updateCitizens() {
        this.citizens.forEach(c => {
            c.x += c.vx;
            c.y += c.vy;
            
            if (this.rng() < 0.02) {
                c.vx = (this.rng() - 0.5) * 0.5;
                c.vy = (this.rng() - 0.5) * 0.5;
            }
        });
    }
}
