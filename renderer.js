/**
 * renderer.js - Client-Server JSON Map Renderer
 * Renders biomes, hillshade 3D relief, dynamically scaled rivers,
 * roads, bridges, settlements, POIs (debug toggled), and animated mobile tokens.
 */
import { ViewportManager, LOD_TIERS } from './viewport.js';

// Curated harmonious color palettes for premium cartography
const BIOME_COLORS = {
    "Deep Ocean": "hsl(215, 55%, 11%)",
    "Shallow Ocean": "hsl(210, 48%, 20%)",
    "Coastal Beach": "hsl(35, 45%, 72%)",
    "Arid Desert": "hsl(40, 50%, 60%)",
    "Lush Plains": "hsl(90, 32%, 44%)",
    "Dense Forest": "hsl(120, 35%, 26%)",
    "Taiga / Boreal": "hsl(150, 24%, 30%)",
    "Murky Swamp": "hsl(100, 20%, 23%)",
    "Rolling Hills": "hsl(75, 26%, 45%)",
    "Craggy Peaks": "hsl(210, 6%, 42%)",
    "Frozen Peaks": "hsl(200, 18%, 88%)",
    "Freshwater Lake": "hsl(205, 58%, 29%)"
};

const BIOME_COLORS_ANTIQUE = {
    "Deep Ocean": "hsl(40, 28%, 73%)",
    "Shallow Ocean": "hsl(40, 24%, 78%)",
    "Coastal Beach": "hsl(38, 25%, 83%)",
    "Arid Desert": "hsl(38, 22%, 80%)",
    "Lush Plains": "hsl(42, 20%, 75%)",
    "Dense Forest": "hsl(42, 18%, 70%)",
    "Taiga / Boreal": "hsl(45, 16%, 68%)",
    "Murky Swamp": "hsl(45, 14%, 66%)",
    "Rolling Hills": "hsl(42, 18%, 72%)",
    "Craggy Peaks": "hsl(40, 10%, 63%)",
    "Frozen Peaks": "hsl(40, 12%, 82%)",
    "Freshwater Lake": "hsl(40, 18%, 75%)"
};

export class MapRenderer {
    constructor(canvas, worldData) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.world = worldData; // JSON data from FastAPI backend

        this.viewport = new ViewportManager(canvas.width, canvas.height);
        this.mapStyle = 'physical'; // Default to Physical Relief
        this.cellSize = 12; // Base scale of cells

        this.worldWidthPx = this.world.width * this.cellSize;
        this.worldHeightPx = this.world.height * this.cellSize;

        // Center camera initially
        this.viewport.camera.x = this.worldWidthPx / 2;
        this.viewport.camera.y = this.worldHeightPx / 2;
        this.viewport.camera.zoom = 0.65; // Nice initial scale

        // Simulation frame count for smooth token micro-animations
        this.animFrame = 0;
    }

    screenToWorld(sx, sy) {
        return this.viewport.screenToWorld(sx, sy, this.cellSize);
    }

    setStyle(style) {
        this.mapStyle = style;
        this.draw();
    }

    update() {
        this.animFrame += 1;
    }

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Canvas Fill Background
        if (this.mapStyle === 'antique') {
            ctx.fillStyle = '#ebdcb9';
        } else {
            ctx.fillStyle = '#0f172a'; // Deep obsidian base
        }
        ctx.fillRect(0, 0, w, h);

        this.viewport.applyTransform(ctx);

        // 1. Draw Cell Terrain (colored by biome + hillshade overlay)
        this.drawTerrain(ctx);

        // 2. Draw Rivers
        this.drawRivers(ctx);

        // 3. Draw Roads
        this.drawRoads(ctx);

        // 4. Draw Bridges
        this.drawBridges(ctx);

        // 5. Draw POIs (Dungeons/Caves - hidden behind debug toggle)
        this.drawPOIs(ctx);

        // 6. Draw Settlements (Town & Outpost)
        this.drawSettlements(ctx);

        // 7. Draw Mobile Tokens (Caravans & Guards)
        this.drawMobileTokens(ctx);

        // 8. Draw Labels (Settlement names)
        this.drawLabels(ctx);

        this.viewport.restoreTransform(ctx);
    }

    drawTerrain(ctx) {
        const size = this.cellSize;
        const style = this.mapStyle;
        const cells = this.world.cells;
        const w = this.world.width;

        // Create mapping from biome name to HSL color
        const colorPalette = style === 'antique' ? BIOME_COLORS_ANTIQUE : BIOME_COLORS;

        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const px = cell.x * size;
            const py = cell.y * size;

            // Base biome color
            let color = colorPalette[cell.biome] || colorPalette["Lush Plains"];

            if (style === 'political') {
                if (cell.water_type !== 'none') {
                    color = "hsl(215, 55%, 11%)";
                } else {
                    color = cell.x + cell.y < 120 ? "hsla(210, 75%, 50%, 0.2)" : "hsla(42, 85%, 50%, 0.2)";
                }
            }

            ctx.fillStyle = color;
            ctx.fillRect(px, py, size + 0.5, size + 0.5);

            // Apply Analytical Hillshade Overlay (except in political styling)
            if (style !== 'political') {
                const hs = cell.hillshade;
                if (hs < 0.49) {
                    const shadowOpacity = (0.5 - hs) * 1.5; // smooth shadow scaling
                    ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
                    ctx.fillRect(px, py, size + 0.5, size + 0.5);
                } else if (hs > 0.51) {
                    const highlightOpacity = (hs - 0.5) * 1.1; // soft highlight scaling
                    ctx.fillStyle = `rgba(255, 255, 255, ${highlightOpacity})`;
                    ctx.fillRect(px, py, size + 0.5, size + 0.5);
                }
            }
        }
    }

    drawRivers(ctx) {
        ctx.save();
        ctx.strokeStyle = this.mapStyle === 'antique' ? 'hsla(38, 25%, 45%, 0.75)' : 'hsl(205, 85%, 55%)';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const size = this.cellSize;
        const grid = this.world.cells;
        const w = this.world.width;

        // Draw segmented paths using actual riverflow values
        this.world.rivers.forEach(path => {
            if (path.length < 2) return;
            for (let i = 0; i < path.length - 1; i++) {
                const c1 = path[i];
                const c2 = path[i+1];
                const flowVal = grid[c2.y * w + c2.x]?.river_flow || 1.0;

                ctx.beginPath();
                ctx.moveTo(c1.x * size + size/2, c1.y * size + size/2);
                ctx.lineTo(c2.x * size + size/2, c2.y * size + size/2);
                // Dynamic river width scaled by upstream accumulation
                ctx.lineWidth = Math.min(4.5, 0.8 + flowVal * 0.15);
                ctx.stroke();
            }
        });
        ctx.restore();
    }

    drawRoads(ctx) {
        ctx.save();
        ctx.strokeStyle = this.mapStyle === 'antique' ? 'rgba(92, 51, 23, 0.65)' : 'rgba(217, 119, 6, 0.85)'; // glowing amber trail
        ctx.lineWidth = 2.0;
        ctx.setLineDash([4, 4]);

        const size = this.cellSize;

        this.world.roads.forEach(road => {
            if (road.path.length === 0) return;
            ctx.beginPath();
            ctx.moveTo(road.path[0].x * size + size/2, road.path[0].y * size + size/2);
            for (let i = 1; i < road.path.length; i++) {
                ctx.lineTo(road.path[i].x * size + size/2, road.path[i].y * size + size/2);
            }
            ctx.stroke();
        });
        ctx.restore();
    }

    drawBridges(ctx) {
        ctx.save();
        const size = this.cellSize;

        this.world.bridges.forEach(b => {
            const bx = b.x * size;
            const by = b.y * size;

            ctx.fillStyle = this.mapStyle === 'antique' ? '#8b7355' : '#78350f'; // rich timber brown
            ctx.strokeStyle = '#451a03';
            ctx.lineWidth = 1.0;

            // Draw a distinct structural rectangular wooden bridge overlay crossing the stream
            ctx.fillRect(bx + 1, by + 3, size - 2, size - 6);
            ctx.strokeRect(bx + 1, by + 3, size - 2, size - 6);
        });
        ctx.restore();
    }

    drawPOIs(ctx) {
        const size = this.cellSize;
        const showPOIs = document.getElementById("poiDebugToggle")?.checked;

        if (showPOIs) {
            ctx.save();
            this.world.pois.forEach(poi => {
                const px = poi.x * size + size/2;
                const py = poi.y * size + size/2;

                // Red glowing dungeon skulls/nodes
                ctx.shadowBlur = 8;
                ctx.shadowColor = 'red';
                ctx.fillStyle = 'hsl(0, 80%, 45%)';
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;

                ctx.beginPath();
                ctx.arc(px, py, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Draw POI Initials "D" for dungeon
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 8px Inter';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText("D", px, py);
            });
            ctx.restore();
        }
    }

    drawSettlements(ctx) {
        ctx.save();
        const size = this.cellSize;

        this.world.settlements.forEach(settle => {
            const cx = settle.x * size + size/2;
            const cy = settle.y * size + size/2;

            ctx.shadowColor = 'black';
            ctx.shadowBlur = 5;

            const isTown = settle.type === 'town';
            const radius = isTown ? 7.5 : 5.0;

            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = isTown ? '#ef4444' : '#f59e0b'; // Royal crimson for Town, Amber for Outpost
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Inner core dot
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = '#0f172a';
            ctx.fill();
        });
        ctx.restore();
    }

    drawMobileTokens(ctx) {
        ctx.save();
        const size = this.cellSize;

        this.world.mobile_tokens.forEach(tok => {
            if (tok.route.length === 0) return;

            // Interpolate position along coordinate tracks for premium micro-animations
            const speed = tok.type === 'caravan' ? 0.08 : 0.15;
            const rawProgress = this.animFrame * speed;
            const index = Math.floor(rawProgress) % tok.route.length;
            const nextIndex = (index + 1) % tok.route.length;
            const ratio = rawProgress % 1.0;

            const p1 = tok.route[index];
            const p2 = tok.route[nextIndex];

            // Linear interpolation
            const tx = p1.x + (p2.x - p1.x) * ratio;
            const ty = p1.y + (p2.y - p1.y) * ratio;

            const cx = tx * size + size/2;
            const cy = ty * size + size/2;

            ctx.shadowColor = 'black';
            ctx.shadowBlur = 6;

            // Caravan vs Guard Patrol colors
            ctx.fillStyle = tok.type === 'caravan' ? 'hsl(142, 70%, 45%)' : 'hsl(215, 80%, 55%)';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;

            ctx.beginPath();
            ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Tiny initial in center
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 6px Inter';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 0;
            ctx.fillText(tok.type === 'caravan' ? 'C' : 'G', cx, cy);
        });
        ctx.restore();
    }

    drawLabels(ctx) {
        const size = this.cellSize;
        ctx.save();

        this.world.settlements.forEach(settle => {
            const cx = settle.x * size + size/2;
            const cy = settle.y * size + size/2;

            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.font = settle.type === 'town' ? 'bold 12px Cinzel, serif' : '10px Inter, sans-serif';
            ctx.textAlign = 'center';

            ctx.strokeText(settle.name, cx, cy - 12);
            ctx.fillText(settle.name, cx, cy - 12);
        });
        ctx.restore();
    }
}
