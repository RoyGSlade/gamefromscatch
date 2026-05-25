/**
 * renderer.js - Canvas Map Renderer
 * Handles LOD drawing across 4 explicit tiers, map styles,
 * Player Tokens, FOW overlays, and seamless zooming transitions.
 */
import { CityPlanner } from './cityGen.js';
import { BIOMES } from './world.js';
import { ViewportManager, LOD_TIERS } from './viewport.js';

export class MapRenderer {
    constructor(canvas, worldMap) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.world = worldMap;
        
        // Cache of procedural city planners
        this.cityPlanners = new Map();

        this.viewport = new ViewportManager(canvas.width, canvas.height);
        
        this.mapStyle = 'physical'; // Defaulting to the requested crisp physical atlas
        
        this.cellSize = 12; // Base scale of world cells
        this.worldWidthPx = this.world.width * this.cellSize;
        this.worldHeightPx = this.world.height * this.cellSize;
        
        // Center camera initially
        this.viewport.camera.x = this.worldWidthPx / 2;
        this.viewport.camera.y = this.worldHeightPx / 2;
        
        this.player = null; // Will be injected by app.js
    }

    setPlayer(playerInstance) {
        this.player = playerInstance;
    }

    getCityPlanner(city) {
        if (!this.cityPlanners.has(city.seed)) {
            this.cityPlanners.set(city.seed, new CityPlanner(city));
        }
        return this.cityPlanners.get(city.seed);
    }

    screenToWorld(sx, sy) {
        return this.viewport.screenToWorld(sx, sy, this.cellSize);
    }

    setStyle(style) {
        this.mapStyle = style;
        this.draw();
    }

    update() {
        this.cityPlanners.forEach(planner => {
            planner.updateCitizens();
        });
    }

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const lod = this.viewport.currentLOD;

        ctx.clearRect(0, 0, w, h);
        
        // Ocean Background Fill
        if (this.mapStyle === 'antique') {
            ctx.fillStyle = '#ebdcb9'; 
        } else {
            ctx.fillStyle = '#001f3f'; // Crisp deep ocean base
        }
        ctx.fillRect(0, 0, w, h);

        this.viewport.applyTransform(ctx);

        // --- LAYER 1: Base Terrain ---
        this.drawTerrain(ctx);

        // --- LAYER 2: Rivers & Roads (If LOD allows) ---
        if (lod >= LOD_TIERS.PROVINCE) {
            this.drawRivers(ctx);
        }

        // --- LAYER 3: Borders ---
        if (this.mapStyle === 'political' || this.mapStyle === 'antique' || lod <= LOD_TIERS.COUNTRY) {
            this.drawBorders(ctx);
        }

        // --- LAYER 4: Cities / Seamless City Layouts ---
        this.drawCities(ctx);
        
        // --- LAYER 5: A* Paths ---
        if (this.player && this.player.path && this.player.path.length > 0) {
            this.drawPlayerPath(ctx);
        }

        // --- LAYER 6: Player Token ---
        if (this.player) {
            this.player.draw(ctx, this.cellSize);
        }

        // --- LAYER 7: Fog of War Overlay ---
        if (this.player && this.player.fowEnabled) {
            this.drawFogOfWar(ctx);
        }

        // --- LAYER 8: Labels (Above everything including FOW) ---
        this.drawLabels(ctx);

        this.viewport.restoreTransform(ctx);
    }

    drawTerrain(ctx) {
        const cellSize = this.cellSize;
        const style = this.mapStyle;
        const sea = this.world.seaLevel;

        for (let y = 0; y < this.world.height; y++) {
            for (let x = 0; x < this.world.width; x++) {
                const cell = this.world.grid[y * this.world.width + x];
                if (!cell) continue;

                const px = x * cellSize;
                const py = y * cellSize;

                if (style === 'physical') {
                    ctx.fillStyle = cell.biome.color;
                    ctx.fillRect(px, py, cellSize + 0.5, cellSize + 0.5);
                } else if (style === 'antique') {
                    ctx.fillStyle = cell.biome.colorAntique;
                    ctx.fillRect(px, py, cellSize + 0.5, cellSize + 0.5);
                } else if (style === 'biomes') {
                    ctx.fillStyle = cell.biome.color;
                    ctx.fillRect(px, py, cellSize + 0.5, cellSize + 0.5);
                } else if (style === 'political') {
                    if (cell.elevation < sea) {
                        ctx.fillStyle = '#001f3f';
                    } else {
                        if (cell.countryId !== -1) {
                            ctx.fillStyle = this.world.countries[cell.countryId].color;
                        } else {
                            ctx.fillStyle = '#2a3439'; 
                        }
                    }
                    ctx.fillRect(px, py, cellSize + 0.5, cellSize + 0.5);
                }
            }
        }
    }

    drawRivers(ctx) {
        ctx.save();
        ctx.strokeStyle = this.mapStyle === 'antique' ? '#bdac87' : '#00A8E8'; // bright clear blue
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        this.world.rivers.forEach(path => {
            if (path.length === 0) return;
            ctx.beginPath();
            ctx.moveTo(path[0].x * this.cellSize + this.cellSize/2, path[0].y * this.cellSize + this.cellSize/2);
            for (let i = 1; i < path.length; i++) {
                ctx.lineTo(path[i].x * this.cellSize + this.cellSize/2, path[i].y * this.cellSize + this.cellSize/2);
            }
            ctx.lineWidth = Math.min(4, 1.0 + (path.length * 0.12));
            ctx.stroke();
        });
        ctx.restore();
    }

    drawBorders(ctx) {
        ctx.save();
        if (this.mapStyle === 'antique') {
            ctx.strokeStyle = 'rgba(102, 34, 34, 0.65)';
            ctx.setLineDash([3, 4]);
            ctx.lineWidth = 2.0;
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 1.5;
        }

        const w = this.world.width;
        const h = this.world.height;
        const size = this.cellSize;

        for (let y = 0; y < h - 1; y++) {
            for (let x = 0; x < w - 1; x++) {
                const c1 = this.world.grid[y * w + x];
                if (!c1 || c1.countryId === -1) continue;

                const cRight = this.world.grid[y * w + (x + 1)];
                if (cRight && cRight.countryId !== c1.countryId && cRight.elevation >= this.world.seaLevel) {
                    ctx.beginPath();
                    ctx.moveTo((x + 1) * size, y * size);
                    ctx.lineTo((x + 1) * size, (y + 1) * size);
                    ctx.stroke();
                }

                const cDown = this.world.grid[(y + 1) * w + x];
                if (cDown && cDown.countryId !== c1.countryId && cDown.elevation >= this.world.seaLevel) {
                    ctx.beginPath();
                    ctx.moveTo(x * size, (y + 1) * size);
                    ctx.lineTo((x + 1) * size, (y + 1) * size);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }

    drawCities(ctx) {
        const size = this.cellSize;
        const lod = this.viewport.currentLOD;
        
        this.world.cities.forEach(city => {
            const cx = city.x * size;
            const cy = city.y * size;

            if (lod === LOD_TIERS.CITY) {
                // Determine bounding box scaling
                const cityWidthBox = 160; 
                const scaleFactor = cityWidthBox / 1000;
                
                ctx.save();
                ctx.translate(cx, cy);
                ctx.scale(scaleFactor, scaleFactor);
                ctx.translate(-500, -500); 
                
                const planner = this.getCityPlanner(city);
                this.drawCityDetailed(ctx, planner);
                ctx.restore();
                
            } else {
                // Draw normal world-view city icons
                ctx.shadowColor = 'black';
                ctx.shadowBlur = 4;

                const isCap = city.isCapital;
                const outerRadius = isCap ? 8.0 : 5.0;
                const innerRadius = isCap ? 4.0 : 2.5;
                
                ctx.beginPath();
                ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
                ctx.fillStyle = isCap ? '#e63946' : '#FFD700'; // Crisp gold
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = '#fff';
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
                ctx.fillStyle = '#0d1b2a';
                ctx.fill();
                
                ctx.shadowBlur = 0; 
            }
        });
    }

    drawCityDetailed(ctx, cp) {
        const style = this.mapStyle;
        const waterY = cp.isCoastal ? cp.height * 0.72 : cp.height;

        ctx.fillStyle = style === 'antique' ? '#e2d1aa' : '#F4F1DE'; // Warm ivory land
        ctx.fillRect(0, 0, cp.width, cp.height);

        if (cp.isCoastal) {
            ctx.fillStyle = style === 'antique' ? '#e9dbb8' : '#E9DCC9'; // Beach
            ctx.fillRect(0, 0, cp.width, waterY);
        }

        // Draw winding city river
        cp.rivers.forEach(riv => {
            ctx.save();
            ctx.strokeStyle = style === 'antique' ? '#bdac87' : '#00A8E8';
            ctx.lineWidth = riv.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            ctx.beginPath();
            ctx.moveTo(riv.points[0].x, riv.points[0].y);
            for (let i = 1; i < riv.points.length; i++) {
                const xc = (riv.points[i-1].x + riv.points[i].x) / 2;
                const yc = (riv.points[i-1].y + riv.points[i].y) / 2;
                ctx.quadraticCurveTo(riv.points[i-1].x, riv.points[i-1].y, xc, yc);
            }
            ctx.stroke();
            ctx.restore();
        });

        // Docks
        ctx.fillStyle = '#854d0e';
        ctx.strokeStyle = '#3f2204';
        ctx.lineWidth = 2.0;
        cp.docks.forEach(dock => {
            ctx.fillRect(dock.x - dock.w/2, dock.y, dock.w, dock.h);
            ctx.strokeRect(dock.x - dock.w/2, dock.y, dock.w, dock.h);
        });

        // Streets
        cp.streets.forEach(street => {
            ctx.save();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.lineWidth = street.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            ctx.beginPath();
            ctx.moveTo(street.points[0].x, street.points[0].y);
            for (let i = 1; i < street.points.length; i++) {
                const xc = (street.points[i-1].x + street.points[i].x) / 2;
                const yc = (street.points[i-1].y + street.points[i].y) / 2;
                ctx.quadraticCurveTo(street.points[i-1].x, street.points[i-1].y, xc, yc);
            }
            ctx.stroke();
            ctx.restore();
        });

        // Buildings
        cp.buildings.forEach(b => {
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(b.angle);

            // House Roof Colors by District
            let roofColor = '#807d6b';
            if (b.district === 'Keep') roofColor = '#4B0082'; // Deep purple
            else if (b.district === 'Market') roofColor = '#8B0000'; // Dark red
            else if (b.district === 'Temple') roofColor = '#FFD700'; // Gold
            else if (b.district === 'Slums') roofColor = '#A0522D'; // Sienna
            else if (b.district === 'Harbor') roofColor = '#2F4F4F'; // Dark slate gray

            ctx.fillStyle = roofColor;
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1.0;

            ctx.beginPath();
            ctx.roundRect(-b.w/2, -b.h/2, b.w, b.h, 2);
            ctx.fill();
            ctx.stroke();

            // Label unknown vs known buildings using Player's passive perception
            if (this.player && this.viewport.currentLOD === LOD_TIERS.CITY) {
                // If it's a shop/important building, draw a small icon or outline
                if (b.purpose !== 'House') {
                    ctx.strokeStyle = '#FFD700';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(-b.w/2, -b.h/2, b.w, b.h);
                }
            }

            ctx.restore();
        });

        // City Wall
        ctx.save();
        ctx.strokeStyle = '#708090'; // Slate gray
        ctx.lineWidth = 10.0;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        if (cp.wallPoints.length > 0) {
            ctx.moveTo(cp.wallPoints[0].x, cp.wallPoints[0].y);
            for (let i = 1; i < cp.wallPoints.length; i++) {
                ctx.lineTo(cp.wallPoints[i].x, cp.wallPoints[i].y);
            }
            ctx.closePath();
            ctx.stroke();
        }
        ctx.restore();
    }

    drawPlayerPath(ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        
        ctx.beginPath();
        const startX = this.player.x * this.cellSize;
        const startY = this.player.y * this.cellSize;
        ctx.moveTo(startX, startY);
        
        for (const node of this.player.path) {
            ctx.lineTo(node.x * this.cellSize, node.y * this.cellSize);
        }
        ctx.stroke();
        ctx.restore();
    }

    drawFogOfWar(ctx) {
        const w = this.world.width;
        const h = this.world.height;
        const size = this.cellSize;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (!this.player.exploredCells[`${x},${y}`]) {
                    ctx.fillRect(x * size, y * size, size + 1, size + 1);
                }
            }
        }
    }

    drawLabels(ctx) {
        const lod = this.viewport.currentLOD;
        if (lod === LOD_TIERS.CONTINENT) return; 

        ctx.save();
        const size = this.cellSize;

        // Render Country Names
        if (lod <= LOD_TIERS.PROVINCE) {
            this.world.countries.forEach(c => {
                ctx.fillStyle = '#FFFFFF';
                // EXPLICIT text stroke for readability
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 3;
                ctx.font = `bold ${Math.max(12, Math.min(26, 16 * this.viewport.camera.zoom))}px "Cinzel", "Georgia", serif`;
                ctx.textAlign = 'center';
                
                const lx = c.capitalX * size;
                const ly = c.capitalY * size - 14;
                ctx.strokeText(c.name.toUpperCase(), lx, ly);
                ctx.fillText(c.name.toUpperCase(), lx, ly);
            });
        }

        // Render City Names
        if (lod >= LOD_TIERS.COUNTRY) {
            this.world.cities.forEach(city => {
                // If it's heavily zoomed in, we draw the detailed building labels instead
                if (lod === LOD_TIERS.CITY) {
                    const planner = this.getCityPlanner(city);
                    this.drawBuildingLabels(ctx, planner, city.x * size, city.y * size);
                } else {
                    const cx = city.x * size;
                    const cy = city.y * size;
                    const isCap = city.isCapital;
                    
                    ctx.fillStyle = '#FFFFFF';
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 2.5;
                    ctx.font = `${isCap ? 'bold 14px' : '11px'} "Inter", sans-serif`;
                    ctx.textAlign = 'center';
                    
                    const outerRadius = isCap ? 8.0 : 5.0;
                    ctx.strokeText(city.name, cx, cy - (outerRadius + 6));
                    ctx.fillText(city.name, cx, cy - (outerRadius + 6));
                }
            });
        }
        ctx.restore();
    }

    drawBuildingLabels(ctx, planner, cityWorldX, cityWorldY) {
        // Draw building labels only for known/revealed structures based on Passive Perception
        const scaleFactor = 160 / 1000;
        
        ctx.textAlign = 'center';
        
        planner.buildings.forEach(b => {
            if (b.purpose === 'House') return; // Too many labels

            // Check passive perception
            let labelText = "Unknown Building";
            if (this.player && this.player.passivePerception >= b.obscurityRating) {
                labelText = b.purpose;
            }

            // Map building local coordinates to world canvas coordinates
            const bx = cityWorldX + (b.x - 500) * scaleFactor;
            const by = cityWorldY + (b.y - 500) * scaleFactor;

            ctx.fillStyle = '#FFF';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.font = 'bold 5px Inter'; // Scaled to the city view zoom
            
            ctx.strokeText(labelText, bx, by - 6);
            ctx.fillText(labelText, bx, by - 6);
        });
    }
}
