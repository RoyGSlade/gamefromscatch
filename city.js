/**
 * city.js - Procedural City Planner
 * Generates organic street grids, defensive walls, castles, harbors, and residential blocks.
 */
import { createPRNG } from './noise.js';

export class CityPlanner {
    constructor(cityNode) {
        this.city = cityNode;
        this.rng = createPRNG(cityNode.seed);
        
        this.width = 1000;
        this.height = 1000;
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;

        this.isCoastal = cityNode.biome.toLowerCase().includes('coast') || cityNode.biome.toLowerCase().includes('beach') || this.rng() > 0.6;
        
        // Structures to generate
        this.castle = null;
        this.wallPoints = [];
        this.gates = [];
        this.rivers = [];
        this.streets = [];
        this.houses = [];
        this.docks = [];
        this.ships = [];
        this.citizens = []; // animated dots walking the streets!

        this.generate();
    }

    generate() {
        const rng = this.rng;
        
        // 1. Generate River or Coastline
        let waterBoundaryY = this.height; // for coastal cities
        
        if (this.isCoastal) {
            // Lower 25% of the canvas is ocean
            waterBoundaryY = this.height * 0.72;
            
            // Generate docks
            const numDocks = Math.floor(3 + rng() * 3);
            for (let i = 0; i < numDocks; i++) {
                const dockX = this.width * 0.2 + (this.width * 0.6) * (i / (numDocks - 1));
                const dockLength = 80 + rng() * 60;
                const dockWidth = 14 + rng() * 8;
                this.docks.push({
                    x: dockX,
                    y: waterBoundaryY - 5,
                    w: dockWidth,
                    h: dockLength
                });

                // Place 1-2 small sailing boats next to the docks
                if (rng() > 0.3) {
                    this.ships.push({
                        x: dockX + (rng() > 0.5 ? 25 : -25),
                        y: waterBoundaryY + dockLength * 0.6 + rng() * 30,
                        angle: rng() * 0.4 - 0.2,
                        size: 15 + rng() * 10
                    });
                }
            }
        }

        // River crossing through the city
        if (rng() > 0.25 || !this.isCoastal) {
            const riverPoints = [];
            const startX = rng() > 0.5 ? 0 : this.width;
            const startY = this.height * 0.1 + rng() * this.height * 0.3;
            
            const endX = this.isCoastal ? this.width * 0.5 : (startX === 0 ? this.width : 0);
            const endY = this.isCoastal ? waterBoundaryY : this.height * 0.6 + rng() * this.height * 0.3;

            const steps = 12;
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const px = startX + (endX - startX) * t;
                const py = startY + (endY - startY) * t + (rng() * 40 - 20);
                riverPoints.push({ x: px, y: py });
            }
            this.rivers.push({
                points: riverPoints,
                width: 25 + rng() * 15
            });
        }

        // 2. Determine Castle Keep Position (placed on high ground / center-top)
        this.castle = {
            x: this.centerX + (rng() * 120 - 60),
            y: this.isCoastal ? this.centerY * 0.7 + (rng() * 80 - 40) : this.centerY + (rng() * 100 - 50),
            radius: 45 + rng() * 20,
            towersCount: Math.floor(4 + rng() * 3)
        };

        // 3. Generate City Walls (encircling the castle and center)
        const wallRadius = 280 + rng() * 80;
        const wallSteps = 16;
        for (let i = 0; i < wallSteps; i++) {
            const angle = (i / wallSteps) * Math.PI * 2;
            
            // Deform circle slightly to look natural
            let r = wallRadius + rng() * 35 - 15;
            
            let px = this.castle.x + Math.cos(angle) * r;
            let py = this.castle.y + Math.sin(angle) * r;

            // Restrict walls from running deep into ocean
            if (this.isCoastal && py > waterBoundaryY - 30) {
                py = waterBoundaryY - 30;
                // Add minor variation along shoreline wall
                px = this.castle.x + Math.cos(angle) * (r * 0.95);
            }

            this.wallPoints.push({ x: px, y: py });
        }

        // 4. Place City Gates along the walls
        // Find segments of the wall that are suitable for gates (not in ocean/river)
        const gateIndices = [2, 6, 10, 14]; // spaced out
        gateIndices.forEach(idx => {
            const p = this.wallPoints[idx % this.wallPoints.length];
            if (!this.isCoastal || p.y < waterBoundaryY - 40) {
                this.gates.push({
                    x: p.x,
                    y: p.y,
                    angle: (idx / wallSteps) * Math.PI * 2
                });
            }
        });

        // 5. Generate Main Arterial Roads (connecting Keep to Gates & Docks)
        this.gates.forEach(gate => {
            const roadPoints = this.generateWavyPath(this.castle.x, this.castle.y, gate.x, gate.y, 6);
            this.streets.push({ points: roadPoints, type: 'main', width: 6 });
        });

        if (this.isCoastal && this.docks.length > 0) {
            // Road to center dock
            const targetDock = this.docks[Math.floor(this.docks.length / 2)];
            const roadPoints = this.generateWavyPath(this.castle.x, this.castle.y, targetDock.x, targetDock.y, 6);
            this.streets.push({ points: roadPoints, type: 'main', width: 6 });
        }

        // 6. Generate Secondary Streets (organic branch-out)
        // Shoot rays out from main roads, bend them, and stop if colliding or exceeding radius
        const secondaryCount = 14 + Math.floor(rng() * 8);
        for (let i = 0; i < secondaryCount; i++) {
            // Pick a random starting point along an existing main road
            const mainRoad = this.streets[Math.floor(rng() * this.streets.length)];
            const startPt = mainRoad.points[Math.floor(1 + rng() * (mainRoad.points.length - 2))];
            
            // Random direction angle
            const angle = rng() * Math.PI * 2;
            const roadLength = 120 + rng() * 150;
            
            const roadPoints = [{ x: startPt.x, y: startPt.y }];
            let currX = startPt.x;
            let currY = startPt.y;
            let currAngle = angle;
            
            const segments = 4;
            let pathOk = true;
            
            for (let j = 0; j < segments; j++) {
                currAngle += rng() * 0.8 - 0.4; // wiggle
                const step = roadLength / segments;
                currX += Math.cos(currAngle) * step;
                currY += Math.sin(currAngle) * step;
                
                // Keep inside walls roughly or just check boundaries
                const distToCastle = Math.hypot(currX - this.castle.x, currY - this.castle.y);
                if (distToCastle > wallRadius * 1.2 || currY > waterBoundaryY - 20) {
                    pathOk = j > 1; // save if at least some street is built
                    break;
                }
                
                roadPoints.push({ x: currX, y: currY });
            }

            if (pathOk && roadPoints.length > 1) {
                this.streets.push({ points: roadPoints, type: 'secondary', width: 3.5 });
            }
        }

        // 7. Place Houses tightly aligned to the streets (organic settlement pattern)
        // For every street, scan along its length, offset sideways to place houses
        this.streets.forEach(street => {
            const points = street.points;
            const houseWidth = 14 + rng() * 8;
            const houseLength = 16 + rng() * 12;
            const spacing = 22 + rng() * 12;

            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const segmentLen = Math.hypot(dx, dy);
                const angle = Math.atan2(dy, dx);
                
                // Step along this segment
                for (let d = 5; d < segmentLen - 5; d += spacing) {
                    const sx = p1.x + Math.cos(angle) * d;
                    const sy = p1.y + Math.sin(angle) * d;
                    
                    // Put houses on left and right sides
                    const sides = [-1, 1];
                    sides.forEach(side => {
                        if (rng() > 0.28) { // fill rate
                            // Offset orthogonal to the road
                            const offsetDist = 18 + rng() * 10;
                            const hx = sx + Math.cos(angle + Math.PI / 2 * side) * offsetDist;
                            const hy = sy + Math.sin(angle + Math.PI / 2 * side) * offsetDist;
                            
                            // Check collisions with river, castle, and ocean
                            let houseOk = true;
                            
                            // Castle collision
                            if (Math.hypot(hx - this.castle.x, hy - this.castle.y) < this.castle.radius + 15) {
                                houseOk = false;
                            }
                            
                            // Water collision
                            if (hy > waterBoundaryY - 10) {
                                houseOk = false;
                            }
                            
                            // River collision
                            for (const riv of this.rivers) {
                                for (const rp of riv.points) {
                                    if (Math.hypot(hx - rp.x, hy - rp.y) < riv.width + 12) {
                                        houseOk = false;
                                        break;
                                    }
                                }
                            }
                            
                            // Keep overlap away from other houses
                            if (houseOk) {
                                for (const h of this.houses) {
                                    if (Math.hypot(hx - h.x, hy - h.y) < 18) {
                                        houseOk = false;
                                        break;
                                    }
                                }
                            }

                            if (houseOk) {
                                // Assign a district type based on location
                                let district = 'residential';
                                const distToCastle = Math.hypot(hx - this.castle.x, hy - this.castle.y);
                                
                                if (distToCastle < wallRadius * 0.4) {
                                    district = 'noble'; // close to castle
                                } else if (this.isCoastal && hy > waterBoundaryY - 120) {
                                    district = 'harbor'; // close to docks
                                } else if (distToCastle > wallRadius * 0.95) {
                                    district = 'suburb'; // outside wall
                                } else if (rng() > 0.75) {
                                    district = 'merchant';
                                }

                                // Custom shape size
                                const w = houseWidth * (district === 'noble' ? 1.3 : (district === 'suburb' ? 0.85 : 1));
                                const l = houseLength * (district === 'noble' ? 1.3 : (district === 'suburb' ? 0.85 : 1));

                                this.houses.push({
                                    x: hx,
                                    y: hy,
                                    w,
                                    h: l,
                                    angle: angle + (rng() * 0.2 - 0.1), // roughly aligned to street
                                    district
                                });
                            }
                        }
                    });
                }
            }
        });

        // 8. Place citizens walking the streets
        const maxCitizens = 40 + Math.floor(rng() * 30);
        for (let i = 0; i < maxCitizens; i++) {
            // Pick a random street and random point on it
            const street = this.streets[Math.floor(rng() * this.streets.length)];
            const ptIdx = Math.floor(rng() * street.points.length);
            const pt = street.points[ptIdx];
            
            // Assign citizen details
            this.citizens.push({
                x: pt.x,
                y: pt.y,
                street: street,
                segmentIdx: Math.max(0, ptIdx - 1),
                direction: rng() > 0.5 ? 1 : -1,
                speed: 0.6 + rng() * 0.8,
                color: rng() > 0.7 ? '#ffd166' : (rng() > 0.5 ? '#06d6a0' : '#ef476f') // simple warm pixel colors
            });
        }
    }

    /**
     * Creates a slightly randomized wavy path between two points
     */
    generateWavyPath(x1, y1, x2, y2, segmentsCount) {
        const points = [{ x: x1, y: y1 }];
        const dx = x2 - x1;
        const dy = y2 - y1;
        const totalDist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);

        const rng = this.rng;

        for (let i = 1; i < segmentsCount; i++) {
            const t = i / segmentsCount;
            // Linear point
            const lx = x1 + dx * t;
            const ly = y1 + dy * t;
            
            // Add perpendicular offset wave
            const offsetMag = (totalDist * 0.06) * Math.sin(t * Math.PI) * (rng() * 2 - 1);
            const ox = lx + Math.cos(angle + Math.PI / 2) * offsetMag;
            const oy = ly + Math.sin(angle + Math.PI / 2) * offsetMag;
            
            points.push({ x: ox, y: oy });
        }
        
        points.push({ x: x2, y: y2 });
        return points;
    }

    /**
     * Animate citizens walking up and down streets
     */
    updateCitizens() {
        this.citizens.forEach(c => {
            const pts = c.street.points;
            const p1 = pts[c.segmentIdx];
            const p2 = pts[Math.min(pts.length - 1, c.segmentIdx + 1)];
            
            if (!p1 || !p2) return;
            
            // Move toward p2 (if direction is 1) or p1 (if direction is -1)
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy);
            
            if (len === 0) return;
            
            // Normalize direction
            const ux = dx / len;
            const uy = dy / len;
            
            c.x += ux * c.speed * c.direction;
            c.y += uy * c.speed * c.direction;
            
            // Check if reached node
            const distToNext = Math.hypot(c.x - (c.direction === 1 ? p2.x : p1.x), c.y - (c.direction === 1 ? p2.y : p1.y));
            if (distToNext < 3) {
                // Change segment index
                c.segmentIdx += c.direction;
                
                // Bounce back at ends of roads
                if (c.segmentIdx >= pts.length - 1) {
                    c.segmentIdx = pts.length - 2;
                    c.direction = -1;
                } else if (c.segmentIdx < 0) {
                    c.segmentIdx = 0;
                    c.direction = 1;
                }
            }
        });
    }
}
