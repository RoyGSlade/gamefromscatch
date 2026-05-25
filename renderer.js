/**
 * renderer.js - Client-Server JSON Map Renderer
 * Renders biomes, hillshade 3D relief, dynamically scaled rivers,
 * roads, bridges, settlements, POIs (debug toggled), and animated mobile tokens.
 */
import { ViewportManager } from './viewport.js';
import { LabelEngine } from './labelEngine.js';

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
    constructor(canvas, worldData, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.world = worldData; // JSON data from FastAPI backend
        this.simulation = options.simulation || null;
        this.player = options.player || null;

        this.viewport = new ViewportManager(canvas.width, canvas.height);
        this.mapStyle = 'physical'; // Default to Physical Relief
        this.cellSize = 12; // Base scale of cells

        this.worldWidthPx = this.world.width * this.cellSize;
        this.worldHeightPx = this.world.height * this.cellSize;

        // Center camera initially
        this.viewport.camera.x = this.worldWidthPx / 2;
        this.viewport.camera.y = this.worldHeightPx / 2;
        this.viewport.camera.zoom = 0.65; // Nice initial scale

        // Retained for visual-only effects; token locations are turn-driven.
        this.animFrame = 0;

        // Interactive selection and hover state trackers
        this.hoveredBuilding = null;
        this.selectedBuilding = null;
        this.hoveredDistrict = null;
        this.hoveredToken = null;

        // Label collision placement engine
        this.labelEngine = new LabelEngine();

        this.controls = {
            poiDebug: document.getElementById('poiDebugToggle'),
            districts: document.getElementById('districtsToggle'),
            districtLabels: document.getElementById('districtLabelsToggle'),
            tokenRoutes: document.getElementById('tokenRoutesToggle')
        };
        this.settlementCellBounds = this.buildSettlementCellBounds();
    }

    worldToScreen(wx, wy) {
        const sx = (wx - this.viewport.camera.x) * this.viewport.camera.zoom + this.canvas.width / 2;
        const sy = (wy - this.viewport.camera.y) * this.viewport.camera.zoom + this.canvas.height / 2;
        return { sx, sy };
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

    setSimulation(simulation) {
        this.simulation = simulation;
    }

    setPlayer(player) {
        this.player = player;
    }

    clamp01(value) {
        return Math.max(0.0, Math.min(1.0, value));
    }

    getLayerAlphas() {
        const zoom = this.viewport.camera.zoom;
        return {
            macroAlpha: this.clamp01((3.5 - zoom) / 2.5),
            microAlpha: this.clamp01((zoom - 1.5) / 2.0),
            detailAlpha: this.clamp01((zoom - 2.75) / 1.25)
        };
    }

    getMobileTokenPosition(token) {
        return this.simulation?.getMobileTokenPosition(token) || token.route?.[0] || { x: token.x ?? 0, y: token.y ?? 0 };
    }

    getBuildingVisibility(building) {
        return this.player?.getBuildingVisibility(building) || 'revealed';
    }

    getBuildingDisplayName(building) {
        const visibility = this.getBuildingVisibility(building);
        if (visibility === 'hidden') return null;
        if (visibility === 'unknown') return 'Unknown Building';
        return building.name;
    }

    buildSettlementCellBounds() {
        if (!this.world.settlement_layouts) return [];

        return this.world.settlement_layouts
            .map(layout => layout.districts[0])
            .filter(Boolean)
            .map(center => ({
                minX: center.x - 10,
                maxX: center.x + 10,
                minY: center.y - 10,
                maxY: center.y + 10
            }));
    }

    isSettlementDetailCell(cell) {
        return this.settlementCellBounds.some(bounds =>
            cell.x >= bounds.minX &&
            cell.x <= bounds.maxX &&
            cell.y >= bounds.minY &&
            cell.y <= bounds.maxY
        );
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
        const { macroAlpha, microAlpha, detailAlpha } = this.getLayerAlphas();

        // 1. Draw Cell Terrain (colored by biome + hillshade overlay)
        this.drawTerrain(ctx);

        // 2. Draw Rivers
        this.drawRivers(ctx);

        // 3. Draw Roads
        this.drawRoads(ctx, macroAlpha);

        // 4. Draw Bridges
        this.drawBridges(ctx);

        // 5. Draw POIs (Dungeons/Caves - hidden behind debug toggle)
        this.drawPOIs(ctx, macroAlpha);

        // 6. Draw Settlements (Town & Outpost)
        this.drawSettlements(ctx, macroAlpha, microAlpha, detailAlpha);

        // 7. Draw Mobile Tokens (Caravans & Guards)
        this.drawMobileTokens(ctx);

        // 8. Draw Player Token
        this.drawPlayer(ctx);

        // 9. Draw Labels (Settlement names)
        this.drawLabels(ctx);

        this.viewport.restoreTransform(ctx);
    }

    drawTerrain(ctx) {
        const size = this.cellSize;
        const style = this.mapStyle;
        const cells = this.world.cells;
        const w = this.world.width;
        const h = this.world.height;
        const { detailAlpha } = this.getLayerAlphas();

        const colorPalette = style === 'antique' ? BIOME_COLORS_ANTIQUE : BIOME_COLORS;

        // Perform visible viewport bounds culling!
        const { minX, maxX, minY, maxY } = this.viewport.getVisibleCellBounds(w, h, size);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const cellIndex = y * w + x;
                const cell = cells[cellIndex];
                if (!cell) continue;

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

                // Hillshade overlay (except in political styling)
                if (style !== 'political') {
                    const hs = cell.hillshade;
                    if (hs < 0.49) {
                        const shadowOpacity = (0.5 - hs) * 1.5;
                        ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
                        ctx.fillRect(px, py, size + 0.5, size + 0.5);
                    } else if (hs > 0.51) {
                        const highlightOpacity = (hs - 0.5) * 1.1;
                        ctx.fillStyle = `rgba(255, 255, 255, ${highlightOpacity})`;
                        ctx.fillRect(px, py, size + 0.5, size + 0.5);
                    }
                }

                if (detailAlpha > 0.01) {
                    ctx.save();
                    ctx.globalAlpha *= detailAlpha;
                    this.drawDetailedSubcells(ctx, cell, px, py, size, style, colorPalette);
                    ctx.restore();
                }
            }
        }
    }

    drawDetailedSubcells(ctx, cell, px, py, size, style, colorPalette) {
        const N = 8;
        const subSize = size / N;
        const biome = cell.biome;
        const hs = cell.hillshade;

        const isSettlementCell = this.isSettlementDetailCell(cell);

        for (let sy = 0; sy < N; sy++) {
            for (let sx = 0; sx < N; sx++) {
                const spx = px + sx * subSize;
                const spy = py + sy * subSize;

                // Deterministic pseudo-random number [0, 1] without string concat
                const val = ( (cell.x * 127 + cell.y * 313 + sx * 13 + sy * 37) ^ 0x4F3E2D1C );
                const noise = Math.abs(Math.sin(val) * 10000) % 1.0;

                let color = colorPalette[biome] || colorPalette["Lush Plains"];

                if (isSettlementCell && cell.water_type === 'none' && !biome.includes("Peaks") && !biome.includes("Hills")) {
                    // Warm worn cobblestones / packed dirt
                    const l = 32 + Math.floor(noise * 8);
                    color = style === 'antique' ? `hsl(38, 18%, ${l + 35}%)` : `hsl(35, 12%, ${l}%)`;
                } else {
                    // Biome micro-shading variations
                    if (biome === "Lush Plains") {
                        const h = 88 + Math.floor(noise * 8);
                        const s = 28 + Math.floor(noise * 8);
                        const l = 40 + Math.floor(noise * 8);
                        color = style === 'antique' ? `hsl(42, 18%, ${l + 25}%)` : `hsl(${h}, ${s}%, ${l}%)`;
                        
                        // Rare wildflower patch
                        if (noise > 0.96) {
                            color = style === 'antique' ? '#d0a060' : (noise > 0.98 ? "#f59e0b" : "#ef4444"); // Amber or Crimson flower
                        }
                    } else if (biome === "Dense Forest") {
                        const h = 116 + Math.floor(noise * 8);
                        const s = 30 + Math.floor(noise * 8);
                        const l = 22 + Math.floor(noise * 8);
                        color = style === 'antique' ? `hsl(42, 16%, ${l + 35}%)` : `hsl(${h}, ${s}%, ${l}%)`;
                        
                        // Forest canopy shadows
                        if (noise > 0.75) {
                            color = style === 'antique' ? `hsl(42, 14%, ${l + 30}%)` : `hsl(${h - 4}, ${s + 5}%, ${l - 4}%)`;
                        }
                    } else if (biome === "Taiga / Boreal") {
                        const h = 145 + Math.floor(noise * 8);
                        const s = 20 + Math.floor(noise * 8);
                        const l = 26 + Math.floor(noise * 8);
                        color = style === 'antique' ? `hsl(45, 14%, ${l + 30}%)` : `hsl(${h}, ${s}%, ${l}%)`;
                    } else if (biome === "Arid Desert") {
                        const h = 38 + Math.floor(noise * 4);
                        const s = 46 + Math.floor(noise * 8);
                        const l = 56 + Math.floor(noise * 8);
                        color = style === 'antique' ? `hsl(38, 20%, ${l + 20}%)` : `hsl(${h}, ${s}%, ${l}%)`;
                    } else if (biome === "Murky Swamp") {
                        const h = 95 + Math.floor(noise * 8);
                        const s = 16 + Math.floor(noise * 8);
                        const l = 19 + Math.floor(noise * 8);
                        color = style === 'antique' ? `hsl(45, 12%, ${l + 35}%)` : `hsl(${h}, ${s}%, ${l}%)`;
                    } else if (biome === "Frozen Peaks") {
                        // Snow line detail: higher places are solid pure white, lower crags show grey granite
                        const isSnow = cell.elevation + (noise - 0.5) * 0.1 > 0.82;
                        color = isSnow ? (style === 'antique' ? "hsl(40, 10%, 86%)" : "hsl(200, 18%, 95%)")
                                       : (style === 'antique' ? "hsl(40, 6%, 58%)" : "hsl(210, 6%, 38%)");
                    } else if (biome === "Craggy Peaks") {
                        // Granite rocky fractures
                        const isFissure = noise > 0.85;
                        color = isFissure ? (style === 'antique' ? "hsl(40, 8%, 45%)" : "hsl(210, 8%, 28%)")
                                          : (style === 'antique' ? "hsl(40, 8%, 61%)" : "hsl(210, 6%, 42%)");
                    } else if (biome === "Rolling Hills") {
                        const h = 73 + Math.floor(noise * 6);
                        const s = 24 + Math.floor(noise * 6);
                        const l = 42 + Math.floor(noise * 6);
                        color = style === 'antique' ? `hsl(42, 16%, ${l + 25}%)` : `hsl(${h}, ${s}%, ${l}%)`;
                    }
                }

                ctx.fillStyle = color;
                ctx.fillRect(spx, spy, subSize + 0.05, subSize + 0.05);

                // Apply Hillshade to subcells smoothly for 3D relief feel
                if (style !== 'political') {
                    if (hs < 0.49) {
                        const shadowOpacity = (0.5 - hs) * 1.5;
                        ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
                        ctx.fillRect(spx, spy, subSize + 0.05, subSize + 0.05);
                    } else if (hs > 0.51) {
                        const highlightOpacity = (hs - 0.5) * 1.1;
                        ctx.fillStyle = `rgba(255, 255, 255, ${highlightOpacity})`;
                        ctx.fillRect(spx, spy, subSize + 0.05, subSize + 0.05);
                    }
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

    drawRoads(ctx, alpha = 1.0) {
        if (alpha <= 0.01) return;
        ctx.save();
        ctx.globalAlpha *= alpha;
        const size = this.cellSize;

        this.world.roads.forEach(road => {
            if (road.path.length === 0) return;

            // Casing pass
            ctx.strokeStyle = this.mapStyle === 'antique' ? 'rgba(40, 30, 20, 0.45)' : 'rgba(15, 23, 42, 0.65)';
            ctx.lineWidth = 3.5;
            ctx.setLineDash([]);
            
            ctx.beginPath();
            ctx.moveTo(road.path[0].x * size + size/2, road.path[0].y * size + size/2);
            for (let i = 1; i < road.path.length; i++) {
                ctx.lineTo(road.path[i].x * size + size/2, road.path[i].y * size + size/2);
            }
            ctx.stroke();

            // Inner pass
            ctx.strokeStyle = this.mapStyle === 'antique' ? 'rgba(92, 51, 23, 0.75)' : 'rgba(217, 119, 6, 0.9)'; // glowing amber trail
            ctx.lineWidth = 2.0;
            ctx.setLineDash([4, 4]);

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

    drawPOIs(ctx, alpha = 1.0) {
        const size = this.cellSize;
        const showPOIs = this.controls.poiDebug?.checked;

        if (showPOIs) {
            ctx.save();
            ctx.globalAlpha *= alpha;
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

    drawSettlements(ctx, macroAlpha = 1.0, microAlpha = 0.0, detailAlpha = 0.0) {
        const size = this.cellSize;

        if (macroAlpha > 0.01) {
            ctx.save();
            ctx.globalAlpha *= macroAlpha;
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

        this.drawSettlementLayouts(ctx, microAlpha, detailAlpha);
    }

    drawSettlementLayouts(ctx, microAlpha = 1.0, detailAlpha = 1.0) {
        if (!this.world.settlement_layouts) return;
        if (microAlpha <= 0.01 && detailAlpha <= 0.01) return;

        const size = this.cellSize;
        
        // Grab debug checkbox elements dynamically (safe fallback if they don't exist)
        const showDistricts = this.controls.districts?.checked ?? false;

        // 1. Draw Districts (translucent circles behind)
        if (showDistricts) {
            ctx.save();
            ctx.globalAlpha *= microAlpha;
            const DISTRICT_COLORS = {
                town_center: "rgba(239, 68, 68, 0.04)",
                market: "rgba(245, 158, 11, 0.04)",
                residential_common: "rgba(59, 130, 246, 0.03)",
                craft: "rgba(16, 185, 129, 0.03)",
                religious: "rgba(139, 92, 246, 0.03)",
                river_industry: "rgba(6, 182, 212, 0.03)",
                docks: "rgba(14, 165, 233, 0.03)",
                
                extraction_site: "rgba(244, 63, 94, 0.04)",
                worker_camp: "rgba(100, 116, 139, 0.03)",
                storage_yard: "rgba(120, 113, 108, 0.03)",
                overseer_office: "rgba(234, 179, 8, 0.04)"
            };

            const DISTRICT_STROKES = {
                town_center: "rgba(239, 68, 68, 0.15)",
                market: "rgba(245, 158, 11, 0.15)",
                residential_common: "rgba(59, 130, 246, 0.12)",
                craft: "rgba(16, 185, 129, 0.12)",
                religious: "rgba(139, 92, 246, 0.12)",
                river_industry: "rgba(6, 182, 212, 0.12)",
                docks: "rgba(14, 165, 233, 0.12)",
                
                extraction_site: "rgba(244, 63, 94, 0.15)",
                worker_camp: "rgba(100, 116, 139, 0.12)",
                storage_yard: "rgba(120, 113, 108, 0.12)",
                overseer_office: "rgba(234, 179, 8, 0.15)"
            };

            this.world.settlement_layouts.forEach(layout => {
                layout.districts.forEach(dist => {
                    const cx = dist.x * size + size/2;
                    const cy = dist.y * size + size/2;
                    const r = dist.radius * size;

                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.fillStyle = DISTRICT_COLORS[dist.type] || "rgba(255, 255, 255, 0.02)";
                    ctx.fill();
                    
                    // Faint outline, or strong highlight if hovered
                    const isHovered = this.hoveredDistrict && this.hoveredDistrict.id === dist.id;
                    ctx.strokeStyle = isHovered ? "rgba(251, 191, 36, 0.75)" : (DISTRICT_STROKES[dist.type] || "rgba(255, 255, 255, 0.1)");
                    ctx.lineWidth = isHovered ? 2.0 : 1.0;
                    if (isHovered) {
                        ctx.setLineDash([4, 4]);
                    } else {
                        ctx.setLineDash([]);
                    }
                    ctx.stroke();
                });
            });
            ctx.restore();
        }

        // 2. Draw Local Roads (casing stroke first, then inner road stroke)
        ctx.save();
        ctx.globalAlpha *= microAlpha;
        this.world.settlement_layouts.forEach(layout => {
            layout.local_roads.forEach(road => {
                if (road.path.length < 2) return;

                let roadColor = "rgba(148, 163, 184, 0.8)";
                let roadWidth = 2.0;
                let isDashed = false;

                if (road.road_type === "stone") {
                    roadColor = this.mapStyle === 'antique' ? 'rgba(80, 80, 80, 0.85)' : 'rgba(203, 213, 225, 0.9)';
                    roadWidth = 2.5;
                } else if (road.road_type === "dirt") {
                    roadColor = this.mapStyle === 'antique' ? 'rgba(120, 90, 60, 0.85)' : 'rgba(180, 130, 70, 0.9)';
                    roadWidth = 2.0;
                } else if (road.road_type === "dockwalk") {
                    roadColor = this.mapStyle === 'antique' ? 'rgba(92, 64, 51, 0.95)' : 'rgba(120, 53, 4, 0.95)';
                    roadWidth = 2.5;
                } else { // footpath
                    roadColor = this.mapStyle === 'antique' ? 'rgba(100, 100, 100, 0.75)' : 'rgba(168, 162, 158, 0.8)';
                    roadWidth = 1.0;
                    isDashed = true;
                }

                // Casing pass
                if (road.road_type !== "footpath") {
                    ctx.strokeStyle = this.mapStyle === 'antique' ? 'rgba(40, 30, 20, 0.6)' : 'rgba(15, 23, 42, 0.7)';
                    ctx.lineWidth = roadWidth + 1.5;
                    ctx.setLineDash([]);
                    ctx.beginPath();
                    ctx.moveTo(road.path[0].x * size + size/2, road.path[0].y * size + size/2);
                    for (let i = 1; i < road.path.length; i++) {
                        ctx.lineTo(road.path[i].x * size + size/2, road.path[i].y * size + size/2);
                    }
                    ctx.stroke();
                }

                // Inner pass
                ctx.strokeStyle = roadColor;
                ctx.lineWidth = roadWidth;
                if (isDashed) {
                    ctx.setLineDash([2, 3]);
                } else {
                    ctx.setLineDash([]);
                }
                ctx.beginPath();
                ctx.moveTo(road.path[0].x * size + size/2, road.path[0].y * size + size/2);
                for (let i = 1; i < road.path.length; i++) {
                    ctx.lineTo(road.path[i].x * size + size/2, road.path[i].y * size + size/2);
                }
                ctx.stroke();
            });
        });
        ctx.restore();

        // 3. Draw Buildings with continuous detail alpha.
        if (detailAlpha > 0.01) {
            ctx.save();
            ctx.globalAlpha *= detailAlpha;
            ctx.shadowBlur = this.mapStyle === 'antique' ? 0 : 3;
            ctx.shadowColor = 'black';

            this.world.settlement_layouts.forEach(layout => {
                layout.buildings.forEach(bld => {
                    const isSelected = this.selectedBuilding && this.selectedBuilding.id === bld.id;
                    const isHovered = this.hoveredBuilding && this.hoveredBuilding.id === bld.id;

                    const px = bld.x * size;
                    const py = bld.y * size;
                    const pw = bld.width * size;
                    const ph = bld.height * size;
                    const cx = px + pw/2;
                    const cy = py + ph/2;

                    // Apply building normalization and inner scale factor to create gaps/yards!
                    const innerScale = 0.75;
                    const spw = pw * innerScale;
                    const sph = ph * innerScale;

                    // Compute cohesive building color
                    let baseColor = "#64748b";
                    const t = bld.type.toLowerCase();
                    if (t.includes("hall") || t.includes("overseer")) {
                        baseColor = this.mapStyle === 'antique' ? "#5c5040" : "#1e40af"; // royal blue
                    } else if (t.includes("house") || t.includes("bunkhouse")) {
                        baseColor = this.mapStyle === 'antique' ? "#785a44" : "#9a3412"; // warm brick/clay
                    } else if (t.includes("tavern") || t.includes("store")) {
                        baseColor = this.mapStyle === 'antique' ? "#8c6d3e" : "#b45309"; // amber/wood
                    } else if (t.includes("blacksmith") || t.includes("sawmill") || t.includes("mill") || t.includes("shed") || t.includes("entrance") || t.includes("yard")) {
                        baseColor = this.mapStyle === 'antique' ? "#4a4f48" : "#334155"; // industrial iron/slate
                    } else if (t.includes("docks") || t.includes("fishmonger") || t.includes("fishery")) {
                        baseColor = this.mapStyle === 'antique' ? "#405c5c" : "#0f766e"; // aquatic teal
                    } else if (t.includes("shrine") || t.includes("temple")) {
                        baseColor = this.mapStyle === 'antique' ? "#6a546d" : "#5b21b6"; // sacred indigo
                    }

                    ctx.fillStyle = baseColor;
                    
                    // Selected/hover outlines
                    if (isSelected) {
                        ctx.strokeStyle = "#fbbf24"; // thick gold outline
                        ctx.lineWidth = 2.0;
                    } else if (isHovered) {
                        ctx.strokeStyle = "#60a5fa"; // thick blue outline
                        ctx.lineWidth = 1.5;
                    } else {
                        ctx.strokeStyle = bld.tier >= 3 ? "rgba(251, 191, 36, 0.8)" : "rgba(255, 255, 255, 0.75)";
                        ctx.lineWidth = bld.tier >= 3 ? 1.2 : 0.8;
                    }

                    ctx.save();
                    ctx.translate(cx, cy);
                    if (bld.rotation) {
                        ctx.rotate(bld.rotation);
                    }
                    ctx.fillRect(-spw/2, -sph/2, spw, sph);
                    ctx.strokeRect(-spw/2, -sph/2, spw, sph);
                    ctx.restore();
                });
            });
            ctx.restore();
        }
    }

    drawMobileTokens(ctx) {
        ctx.save();
        const size = this.cellSize;
        const zoom = this.viewport.camera.zoom;
        const { detailAlpha } = this.getLayerAlphas();
        ctx.globalAlpha *= 1.0 - detailAlpha * 0.45;

        const showTokenRoutes = this.controls.tokenRoutes?.checked ?? false;

        this.world.mobile_tokens.forEach(tok => {
            if (tok.route.length === 0) return;

            const position = this.getMobileTokenPosition(tok);
            const tx = position.x;
            const ty = position.y;

            const cx = tx * size + size/2;
            const cy = ty * size + size/2;

            // Draw A* routes overlay if debug is enabled
            if (showTokenRoutes) {
                ctx.save();
                ctx.strokeStyle = tok.type === 'caravan' ? 'rgba(74, 222, 128, 0.35)' : 'rgba(96, 165, 250, 0.35)';
                ctx.lineWidth = 1.0;
                ctx.setLineDash([2, 3]);
                ctx.beginPath();
                ctx.moveTo(tok.route[0].x * size + size/2, tok.route[0].y * size + size/2);
                for (let i = 1; i < tok.route.length; i++) {
                    ctx.lineTo(tok.route[i].x * size + size/2, tok.route[i].y * size + size/2);
                }
                ctx.stroke();
                ctx.restore();
            }

            ctx.save();
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 4;

            // Keep screen radius clamped between 5px and 12px
            const desiredScreenRadius = 6.5; 
            const worldRadius = desiredScreenRadius / zoom;

            // Caravan vs Guard Patrol colors
            ctx.fillStyle = tok.type === 'caravan' ? 'hsl(142, 70%, 45%)' : 'hsl(215, 80%, 55%)';
            
            // Faint token border outline
            const isHovered = this.hoveredToken && this.hoveredToken.id === tok.id;
            ctx.strokeStyle = isHovered ? '#fbbf24' : '#ffffff';
            ctx.lineWidth = isHovered ? 2.0 / zoom : 1.2 / zoom;

            ctx.beginPath();
            ctx.arc(cx, cy, worldRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            const initialAlpha = isHovered ? 1.0 : this.clamp01(1.0 - detailAlpha * 0.85);
            if (initialAlpha > 0.02) {
                ctx.save();
                ctx.globalAlpha *= initialAlpha;
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${Math.max(4, Math.floor(6.5 / zoom))}px Inter`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(tok.type === 'caravan' ? 'C' : 'G', cx, cy);
                ctx.restore();
            }
        });
        ctx.restore();
    }

    drawPlayer(ctx) {
        if (!this.player) return;
        this.player.draw(ctx, this.cellSize, this.viewport.camera.zoom);
    }

    drawLabels(ctx) {
        const zoom = this.viewport.camera.zoom;
        const size = this.cellSize;
        const { macroAlpha, microAlpha, detailAlpha } = this.getLayerAlphas();
        
        // Reset label engine log
        this.labelEngine.reset();

        const labelCandidates = [];

        // 1. Gather Settlement labels
        if (macroAlpha > 0.01) {
            this.world.settlements.forEach(settle => {
                const isTown = settle.type === 'town';
                // Priorities: settlements are extremely important, especially capitals
                const priority = isTown ? 90 : 80;

                const wx = settle.x * size + size/2;
                const wy = settle.y * size + size/2;

                labelCandidates.push({
                    type: 'settlement',
                    text: settle.name,
                    wx,
                    wy,
                    priority,
                    fontSize: isTown ? 12 : 10,
                    fontFamily: isTown ? 'Cinzel, serif' : 'Inter, sans-serif',
                    fontWeight: isTown ? 'bold' : 'normal',
                    textColor: this.mapStyle === 'antique' ? '#2e1a05' : '#ffffff',
                    shadowColor: this.mapStyle === 'antique' ? 'rgba(235, 220, 185, 0.85)' : 'rgba(0, 0, 0, 0.85)',
                    shadowBlur: 3,
                    alpha: macroAlpha
                });
            });
        }

        // 2. Gather District labels (if enabled)
        const showDistrictLabels = this.controls.districtLabels?.checked ?? false;
        if (showDistrictLabels && microAlpha > 0.01 && this.world.settlement_layouts) {
            this.world.settlement_layouts.forEach(layout => {
                layout.districts.forEach(dist => {
                    const wx = dist.x * size + size/2;
                    const wy = dist.y * size + size/2;

                    labelCandidates.push({
                        type: 'district',
                        text: dist.type.replace("_", " ").toUpperCase(),
                        wx,
                        wy,
                        priority: 50,
                        fontSize: 8.5,
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 'bold',
                        textColor: this.mapStyle === 'antique' ? 'rgba(67, 43, 20, 0.7)' : 'rgba(167, 139, 250, 0.85)',
                        shadowColor: this.mapStyle === 'antique' ? 'rgba(235, 220, 185, 0.8)' : 'rgba(0, 0, 0, 0.8)',
                        shadowBlur: 2,
                        alpha: microAlpha
                    });
                });
            });
        }

        // 3. Gather Building labels with smooth detail fade-in.
        if (this.world.settlement_layouts) {
            const MAJOR_BUILDING_TYPES = ["town_hall", "tavern/inn", "shrine", "temple", "blacksmith", "general_store", "granary", "docks", "mill", "fishmonger", "mining_office", "mine_entrance"];

            this.world.settlement_layouts.forEach(layout => {
                layout.buildings.forEach(bld => {
                    const isSelected = this.selectedBuilding && this.selectedBuilding.id === bld.id;
                    const isHovered = this.hoveredBuilding && this.hoveredBuilding.id === bld.id;
                    const isMajor = MAJOR_BUILDING_TYPES.includes(bld.type.toLowerCase()) || bld.tier >= 3;
                    const visibility = this.getBuildingVisibility(bld);
                    if (detailAlpha <= 0.01 && !isHovered && !isSelected) {
                        return;
                    }
                    if (visibility === 'hidden' && !isHovered && !isSelected) {
                        return;
                    }

                    // Exclude minor houses/cottages unless hovered or selected
                    if (!isMajor && !isSelected && !isHovered) {
                        return;
                    }

                    // Assign priority
                    let priority = 10; // Base minor
                    if (isMajor) priority = 60;
                    if (isHovered) priority = 95;
                    if (isSelected) priority = 100; // Absolute top priority

                    const px = bld.x * size;
                    const py = bld.y * size;
                    const pw = bld.width * size;
                    const ph = bld.height * size;
                    const cx = px + pw/2;
                    const cy = py + ph/2;

                    // Fit to building footprint check: if text too wide in pixels, we can abbreviate or hide if not hovered/selected
                    let displayName = this.getBuildingDisplayName(bld) || 'Unknown Building';
                    ctx.save();
                    ctx.font = `bold 8px Inter, sans-serif`;
                    const measured = ctx.measureText(displayName).width;
                    ctx.restore();

                    // If text is wider than footprint and not hovered/selected: abbreviate or hide
                    if (measured > pw && !isSelected && !isHovered) {
                        // For cottages/minor buildings: hide
                        if (!isMajor) return;
                        
                        // For major buildings: abbreviate name if possible, or hide if extremely narrow
                        if (pw < 15) return; // footprint too tiny
                        displayName = visibility === 'unknown' ? 'Unknown Building' : bld.type.replace("_", " ").toUpperCase();
                    }

                    labelCandidates.push({
                        type: 'building',
                        text: displayName,
                        wx: cx,
                        wy: cy,
                        priority,
                        fontSize: isSelected ? 9.5 : (isHovered ? 9.0 : 8.0),
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: (isSelected || isHovered) ? 'bold' : '500',
                        textColor: visibility === 'unknown' ? '#cbd5e1' : (isSelected ? '#fbbf24' : (isHovered ? '#60a5fa' : '#ffffff')),
                        shadowColor: 'rgba(0, 0, 0, 0.95)',
                        shadowBlur: 3,
                        alpha: (isSelected || isHovered) ? 1.0 : detailAlpha
                    });
                });
            });
        }

        // 4. Gather Mobile Token labels
        this.world.mobile_tokens.forEach(tok => {
            const isHovered = this.hoveredToken && this.hoveredToken.id === tok.id;
            if (!isHovered) return;

            const p = this.getMobileTokenPosition(tok);

            const wx = p.x * size + size/2;
            const wy = p.y * size + size/2;

            labelCandidates.push({
                type: 'token',
                text: `${tok.type.toUpperCase()}: ${tok.name || tok.origin || 'Route'}`,
                wx,
                wy: wy - 10 / zoom, // Offset above token
                priority: 98,
                fontSize: 8.5,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 'bold',
                textColor: '#34d399',
                shadowColor: 'rgba(0, 0, 0, 0.95)',
                shadowBlur: 3,
                alpha: 1.0
            });
        });

        // Sort candidates by priority descending (highest first)
        labelCandidates.sort((a, b) => b.priority - a.priority);

        // Place labels in screen-space
        ctx.save();
        labelCandidates.forEach(cand => {
            // Convert world pixels to screen pixels
            const { sx, sy } = this.worldToScreen(cand.wx, cand.wy);

            // Attempt to place label
            const success = this.labelEngine.tryPlaceLabel(ctx, cand.text, sx, sy, cand.priority, {
                fontSize: cand.fontSize,
                fontFamily: cand.fontFamily,
                fontWeight: cand.fontWeight
            });

            if (success) {
                // Draw text in screen-space
                ctx.save();
                ctx.globalAlpha *= cand.alpha ?? 1.0;
                ctx.fillStyle = cand.textColor;
                ctx.strokeStyle = cand.shadowColor;
                ctx.lineWidth = cand.shadowBlur;
                ctx.font = `${cand.fontWeight} ${cand.fontSize}px ${cand.fontFamily}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                ctx.strokeText(cand.text, sx, sy);
                ctx.fillText(cand.text, sx, sy);
                ctx.restore();
            }
        });
        ctx.restore();
    }
}
