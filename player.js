/**
 * player.js - Turn-driven party token, pathfinding, and perception state.
 */

import { getTurnCostForCell } from './simulation.js';

function keyFor(x, y) {
    return `${x},${y}`;
}

export class Player {
    constructor(startX, startY, worldData) {
        this.world = worldData;
        this.cellX = startX;
        this.cellY = startY;
        this.x = startX;
        this.y = startY;
        this.level = 3;
        this.passivePerception = 14;
        this.reputation = 50;
        this.sightRadius = 8;
        this.exploredCells = new Set();
        this.lastPath = [];
        this.lastMoveCost = 0;
        this.roadCells = this.buildRoadCellSet();

        this.updateFOW();
    }

    buildRoadCellSet() {
        const cells = new Map();
        const setRoad = (node, tag) => {
            const key = keyFor(node.x, node.y);
            if (cells.get(key) === 'Main Highway') return;
            cells.set(key, tag);
        };

        (this.world.roads || []).forEach(road => {
            const roadType = road.type || road.route_type || road.road_type || road.route_status;
            const tag = roadType === 'highway' || roadType === 'Main Highway' ? 'Main Highway' : 'Dirt Road';
            (road.path || []).forEach(node => setRoad(node, tag));
        });
        (this.world.settlement_layouts || []).forEach(layout => {
            (layout.local_roads || []).forEach(road => {
                (road.path || []).forEach(node => setRoad(node, 'Dirt Road'));
            });
        });
        return cells;
    }

    getCell(x, y) {
        if (x < 0 || y < 0 || x >= this.world.width || y >= this.world.height) return null;
        return this.world.cells[y * this.world.width + x] || null;
    }

    getTravelCost(x, y) {
        const cell = this.getCell(x, y);
        const routeTag = this.roadCells.get(keyFor(x, y)) || null;
        return getTurnCostForCell(cell, routeTag);
    }

    findPath(targetX, targetY) {
        const targetCost = this.getTravelCost(targetX, targetY);
        if (targetCost >= 999) return [];

        const startKey = keyFor(this.cellX, this.cellY);
        const targetKey = keyFor(targetX, targetY);
        const open = [{
            x: this.cellX,
            y: this.cellY,
            g: 0,
            f: Math.hypot(targetX - this.cellX, targetY - this.cellY),
            parent: null
        }];
        const best = new Map([[startKey, 0]]);
        const closed = new Set();
        const neighbors = [
            [0, -1], [1, 0], [0, 1], [-1, 0],
            [1, -1], [1, 1], [-1, 1], [-1, -1]
        ];
        let iterations = 0;

        while (open.length > 0 && iterations < 8000) {
            iterations += 1;
            open.sort((a, b) => a.f - b.f);
            const current = open.shift();
            const currentKey = keyFor(current.x, current.y);

            if (currentKey === targetKey) {
                const path = [];
                let node = current;
                while (node.parent) {
                    path.push({ x: node.x, y: node.y });
                    node = node.parent;
                }
                path.reverse();
                return path;
            }

            if (closed.has(currentKey)) continue;
            closed.add(currentKey);

            for (const [dx, dy] of neighbors) {
                const nx = current.x + dx;
                const ny = current.y + dy;
                const nKey = keyFor(nx, ny);
                if (closed.has(nKey)) continue;

                const baseCost = this.getTravelCost(nx, ny);
                if (baseCost >= 999) continue;

                const diagonalMultiplier = dx !== 0 && dy !== 0 ? 1.4 : 1;
                const g = current.g + baseCost * diagonalMultiplier;
                if (best.has(nKey) && best.get(nKey) <= g) continue;

                best.set(nKey, g);
                open.push({
                    x: nx,
                    y: ny,
                    g,
                    f: g + Math.hypot(targetX - nx, targetY - ny),
                    parent: current
                });
            }
        }

        return [];
    }

    moveTo(targetX, targetY) {
        const path = this.findPath(targetX, targetY);
        if (path.length === 0) {
            return {
                ok: false,
                cost: 999,
                steps: 0,
                path: []
            };
        }

        let totalCost = 0;
        path.forEach(step => {
            totalCost += this.getTravelCost(step.x, step.y);
        });

        const destination = path[path.length - 1];
        this.cellX = destination.x;
        this.cellY = destination.y;
        this.x = destination.x;
        this.y = destination.y;
        this.lastPath = path;
        this.lastMoveCost = totalCost;
        this.updateFOW();

        return {
            ok: true,
            cost: totalCost,
            steps: path.length,
            path
        };
    }

    updateFOW() {
        const radiusSq = this.sightRadius * this.sightRadius;
        for (let y = this.cellY - this.sightRadius; y <= this.cellY + this.sightRadius; y++) {
            for (let x = this.cellX - this.sightRadius; x <= this.cellX + this.sightRadius; x++) {
                if (x < 0 || y < 0 || x >= this.world.width || y >= this.world.height) continue;
                const dx = x - this.cellX;
                const dy = y - this.cellY;
                if (dx * dx + dy * dy <= radiusSq) {
                    this.exploredCells.add(keyFor(x, y));
                }
            }
        }
    }

    isCellExplored(x, y) {
        return this.exploredCells.has(keyFor(x, y));
    }

    isBuildingObserved(building) {
        for (let y = building.y; y < building.y + building.height; y++) {
            for (let x = building.x; x < building.x + building.width; x++) {
                if (this.isCellExplored(x, y)) return true;
            }
        }
        return false;
    }

    getBuildingVisibility(building) {
        if (!this.isBuildingObserved(building)) return 'hidden';
        const threshold = building.obscurity_rating ?? 0;
        return this.passivePerception >= threshold ? 'revealed' : 'unknown';
    }

    draw(ctx, cellSize, zoom) {
        const px = this.x * cellSize + cellSize / 2;
        const py = this.y * cellSize + cellSize / 2;
        const desiredScreenRadius = 8;
        const worldRadius = desiredScreenRadius / zoom;

        ctx.save();
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 8 / zoom;
        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2 / zoom;

        ctx.beginPath();
        ctx.arc(px, py, worldRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, worldRadius * 1.55, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.stroke();
        ctx.restore();
    }
}
