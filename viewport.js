/**
 * viewport.js - Continuous camera scaling manager.
 * Maintains pan/zoom transforms while render layers derive opacity from zoom.
 */

export class ViewportManager {
    constructor(canvasWidth, canvasHeight) {
        this.camera = {
            x: 0,
            y: 0,
            zoom: 0.35 // Start at continent level
        };
        this.width = canvasWidth;
        this.height = canvasHeight;
    }

    resize(w, h) {
        this.width = w;
        this.height = h;
    }

    /**
     * Updates the camera position based on dragging.
     */
    pan(dx, dy) {
        this.camera.x -= dx / this.camera.zoom;
        this.camera.y -= dy / this.camera.zoom;
    }

    /**
     * Zooms the camera focusing exactly on the target cursor coordinates.
     */
    zoomAt(targetX, targetY, delta, minZoom = 0.12, maxZoom = 35.0) {
        const oldZoom = this.camera.zoom;
        const zoomFactor = 1.15;
        let newZoom = oldZoom;
        
        if (delta > 0) { // Zoom in
            newZoom = Math.min(maxZoom, oldZoom * zoomFactor);
        } else { // Zoom out
            newZoom = Math.max(minZoom, oldZoom / zoomFactor);
        }
        
        // World point under cursor BEFORE zoom
        const wx = (targetX - this.width / 2) / oldZoom + this.camera.x;
        const wy = (targetY - this.height / 2) / oldZoom + this.camera.y;
        
        this.camera.zoom = newZoom;
        
        // Re-center camera such that the world point stays under the cursor
        this.camera.x = wx - (targetX - this.width / 2) / newZoom;
        this.camera.y = wy - (targetY - this.height / 2) / newZoom;
    }

    /**
     * Converts Screen Coordinates (pixels) to World Coordinates (cells)
     */
    screenToWorld(sx, sy, cellSize) {
        const wx = (sx - this.width / 2) / this.camera.zoom + this.camera.x;
        const wy = (sy - this.height / 2) / this.camera.zoom + this.camera.y;
        
        const cellX = Math.floor(wx / cellSize);
        const cellY = Math.floor(wy / cellSize);
        
        return { cellX, cellY, wx, wy };
    }

    getVisibleCellBounds(worldWidth, worldHeight, cellSize) {
        const minX = Math.max(0, Math.floor(((0 - this.width / 2) / this.camera.zoom + this.camera.x) / cellSize) - 1);
        const minY = Math.max(0, Math.floor(((0 - this.height / 2) / this.camera.zoom + this.camera.y) / cellSize) - 1);
        const maxX = Math.min(worldWidth - 1, Math.ceil(((this.width - this.width / 2) / this.camera.zoom + this.camera.x) / cellSize) + 1);
        const maxY = Math.min(worldHeight - 1, Math.ceil(((this.height - this.height / 2) / this.camera.zoom + this.camera.y) / cellSize) + 1);
        return { minX, maxX, minY, maxY };
    }

    /**
     * Prepares Canvas Context with the Camera Matrix.
     */
    applyTransform(ctx) {
        ctx.save();
        ctx.translate(this.width / 2, this.height / 2);
        ctx.scale(this.camera.zoom, this.camera.zoom);
        ctx.translate(-this.camera.x, -this.camera.y);
    }
    
    restoreTransform(ctx) {
        ctx.restore();
    }
}
