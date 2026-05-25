/**
 * labelEngine.js - Priority-based Collision-Avoidance Label Placement Engine
 */
export class LabelEngine {
    constructor() {
        this.placedBoxes = [];
    }

    /**
     * Resets the placement log. Call before each frame's label pass.
     */
    reset() {
        this.placedBoxes = [];
    }

    /**
     * Computes the screen bounding box of a label and checks for collisions.
     * If no collision, adds to placed log and returns true. Otherwise returns false.
     */
    tryPlaceLabel(ctx, text, sx, sy, priority, options = {}) {
        const fontSize = options.fontSize || 9;
        const fontFamily = options.fontFamily || 'Inter, sans-serif';
        const paddingX = options.paddingX !== undefined ? options.paddingX : 4;
        const paddingY = options.paddingY !== undefined ? options.paddingY : 2;
        
        ctx.save();
        ctx.font = `${options.fontWeight || 'normal'} ${fontSize}px ${fontFamily}`;
        
        // Measure text dimensions
        const metrics = ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize;

        ctx.restore();

        // Calculate bounding box in screen pixels
        // Alignment options: center (default), top, bottom
        let boxLeft = sx - textWidth / 2 - paddingX;
        let boxTop = sy - textHeight / 2 - paddingY;

        if (options.alignX === 'left') {
            boxLeft = sx - paddingX;
        } else if (options.alignX === 'right') {
            boxLeft = sx - textWidth - paddingX;
        }

        if (options.alignY === 'top') {
            boxTop = sy - textHeight - paddingY;
        } else if (options.alignY === 'bottom') {
            boxTop = sy - paddingY;
        }

        const box = {
            left: boxLeft,
            right: boxLeft + textWidth + paddingX * 2,
            top: boxTop,
            bottom: boxTop + textHeight + paddingY * 2,
            text,
            priority
        };

        // Collision Check: check if this box overlaps with any already placed labels
        for (const placed of this.placedBoxes) {
            if (this.rectsIntersect(box, placed)) {
                // Collision detected! Drop this label.
                return false;
            }
        }

        // Successfully placed
        this.placedBoxes.push(box);
        return true;
    }

    rectsIntersect(r1, r2) {
        return !(r2.left > r1.right || 
                 r2.right < r1.left || 
                 r2.top > r1.bottom || 
                 r2.bottom < r1.top);
    }
}
