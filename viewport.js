/**
 * viewport.js - Multi-Tier Zoom & Level of Detail Engine
 * Manages explicit LOD states (Continent, Country, Province, City)
 * and camera transition math.
 */

export const LOD_TIERS = {
    CONTINENT: 0, // Zoom < 1.0 (Macro level: landmasses, borders)
    COUNTRY: 1,   // Zoom 1.0 - 3.5 (Mountain ranges, major roads)
    PROVINCE: 2,  // Zoom 3.5 - 7.5 (Topography, rivers, minor towns)
    CITY: 3       // Zoom >= 7.5 (Full transition to organic city-grid)
};

export class ViewportManager {
    constructor(canvasWidth, canvasHeight) {
        this.camera = {
            x: 0,
            y: 0,
            zoom: 0.35 // Start at continent level
        };
        this.width = canvasWidth;
        this.height = canvasHeight;
        this.currentLOD = LOD_TIERS.CONTINENT;
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

        this.updateLOD();
    }

    /**
     * Determines the explicit LOD tier based on zoom.
     */
    updateLOD() {
        const z = this.camera.zoom;
        if (z >= 7.5) {
            this.currentLOD = LOD_TIERS.CITY;
        } else if (z >= 3.5) {
            this.currentLOD = LOD_TIERS.PROVINCE;
        } else if (z >= 1.0) {
            this.currentLOD = LOD_TIERS.COUNTRY;
        } else {
            this.currentLOD = LOD_TIERS.CONTINENT;
        }
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
