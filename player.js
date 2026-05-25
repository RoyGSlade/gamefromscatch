/**
 * player.js - RPG Player Token & Pathfinding Engine
 * Handles A* pathfinding on the grid, smooth movement interpolation,
 * and Fog of War (FOW) tracking based on sight radius.
 */

export class Player {
    constructor(startX, startY, worldMap) {
        this.world = worldMap;
        
        // Logical Grid Position
        this.cellX = startX;
        this.cellY = startY;
        
        // Visual interpolation position
        this.x = startX;
        this.y = startY;
        
        // Pathfinding state
        this.path = [];
        this.isMoving = false;
        this.speed = 4.0; // cells per second
        
        // RPG Stats
        this.level = 3;
        this.passivePerception = 14;
        this.reputation = 50; // Neutral
        
        // Fog of War
        this.fowEnabled = true;
        this.sightRadius = 8; // cells
        this.exploredCells = {}; // "x,y" -> true
        
        this.updateFOW();
    }

    /**
     * Called every frame to interpolate movement along the path
     */
    update(dt) {
        if (this.path.length > 0) {
            this.isMoving = true;
            const target = this.path[0];
            
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const dist = Math.hypot(dx, dy);
            
            const moveAmt = this.speed * dt;
            
            if (dist <= moveAmt) {
                // Reached node
                this.x = target.x;
                this.y = target.y;
                this.cellX = target.x;
                this.cellY = target.y;
                this.path.shift();
                this.updateFOW();
            } else {
                // Move towards node
                this.x += (dx / dist) * moveAmt;
                this.y += (dy / dist) * moveAmt;
            }
        } else {
            this.isMoving = false;
        }
    }

    /**
     * Computes A* Pathfinding from current position to target (tx, ty)
     */
    setTarget(tx, ty) {
        if (!this.world.getCell(tx, ty)) return;
        
        // Basic A* Implementation
        const startNode = { x: this.cellX, y: this.cellY, g: 0, h: 0, f: 0, parent: null };
        const endNode = { x: tx, y: ty };
        
        const openList = [startNode];
        const closedList = new Set();
        const maxIterations = 2000;
        let iters = 0;
        
        while (openList.length > 0 && iters < maxIterations) {
            iters++;
            
            // Get node with lowest f
            let lowestIndex = 0;
            for (let i = 0; i < openList.length; i++) {
                if (openList[i].f < openList[lowestIndex].f) {
                    lowestIndex = i;
                }
            }
            
            let current = openList[lowestIndex];
            
            // Reached goal?
            if (current.x === endNode.x && current.y === endNode.y) {
                const path = [];
                let curr = current;
                while (curr.parent) {
                    path.push({x: curr.x, y: curr.y});
                    curr = curr.parent;
                }
                this.path = path.reverse();
                return;
            }
            
            openList.splice(lowestIndex, 1);
            closedList.add(`${current.x},${current.y}`);
            
            // Neighbors
            const neighbors = [
                {x: 0, y: -1}, {x: 0, y: 1}, {x: -1, y: 0}, {x: 1, y: 0},
                {x: -1, y: -1}, {x: 1, y: -1}, {x: -1, y: 1}, {x: 1, y: 1} // Diagonals
            ];
            
            for (const offset of neighbors) {
                const nx = current.x + offset.x;
                const ny = current.y + offset.y;
                const key = `${nx},${ny}`;
                
                if (closedList.has(key)) continue;
                
                const cell = this.world.getCell(nx, ny);
                if (!cell) continue;
                
                // Determine traversal cost
                let cost = 1.0;
                if (cell.biome.isWater) cost = 999; // Impassable for now
                if (cell.biome.name === 'Craggy Peaks' || cell.biome.name === 'Frozen Peaks') cost = 999;
                if (cell.biome.name === 'Dense Forest' || cell.biome.name === 'Murky Swamp') cost = 3.0;
                if (cell.biome.name === 'Rolling Hills') cost = 2.0;
                if (offset.x !== 0 && offset.y !== 0) cost *= 1.414; // Diagonal
                
                if (cost >= 999) continue;
                
                const gScore = current.g + cost;
                
                let neighborNode = openList.find(n => n.x === nx && n.y === ny);
                
                if (!neighborNode) {
                    neighborNode = { x: nx, y: ny, parent: current };
                    neighborNode.g = gScore;
                    neighborNode.h = Math.hypot(endNode.x - nx, endNode.y - ny); // Heuristic
                    neighborNode.f = neighborNode.g + neighborNode.h;
                    openList.push(neighborNode);
                } else if (gScore < neighborNode.g) {
                    neighborNode.g = gScore;
                    neighborNode.f = neighborNode.g + neighborNode.h;
                    neighborNode.parent = current;
                }
            }
        }
        
        console.warn("A* failed to find path or max iterations reached.");
        this.path = []; // Failed to find path
    }

    /**
     * Clears Fog of War around the player
     */
    updateFOW() {
        if (!this.fowEnabled) return;
        
        const r = this.sightRadius;
        const rSq = r * r;
        
        for (let y = this.cellY - r; y <= this.cellY + r; y++) {
            for (let x = this.cellX - r; x <= this.cellX + r; x++) {
                if (x < 0 || x >= this.world.width || y < 0 || y >= this.world.height) continue;
                
                const dx = x - this.cellX;
                const dy = y - this.cellY;
                if ((dx*dx + dy*dy) <= rSq) {
                    this.exploredCells[`${x},${y}`] = true;
                }
            }
        }
    }

    /**
     * Draw the player token (a glowing sphere or icon)
     */
    draw(ctx, cellSize) {
        const px = this.x * cellSize + cellSize / 2;
        const py = this.y * cellSize + cellSize / 2;
        
        ctx.save();
        ctx.shadowColor = '#4cc9f0';
        ctx.shadowBlur = 10;
        
        // Inner core
        ctx.beginPath();
        ctx.arc(px, py, cellSize * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        
        // Outer ring
        ctx.beginPath();
        ctx.arc(px, py, cellSize * 0.6, 0, Math.PI * 2);
        ctx.strokeStyle = '#4cc9f0';
        ctx.lineWidth = 2.0;
        ctx.stroke();
        
        ctx.restore();
    }
}
