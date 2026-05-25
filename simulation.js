/**
 * simulation.js - Global Clock & Simulation Loop
 * Handles Day/Night cycles, time passage, UI updates, and schedule states (e.g., locking shops at night).
 */

export class Simulation {
    constructor() {
        this.timeOfDay = 8.0; // Start at 8:00 AM
        this.timeSpeed = 0.5; // Game hours per real second
        
        // UI Elements
        this.timeDisplay = document.getElementById('timeDisplay');
        this.dayPhaseDisplay = document.getElementById('dayPhaseDisplay');
        this.nightOverlay = document.getElementById('nightOverlay');
    }

    update(dt) {
        // Advance time
        this.timeOfDay += this.timeSpeed * dt;
        if (this.timeOfDay >= 24.0) {
            this.timeOfDay -= 24.0;
        }

        this.updateUI();
        this.updateVisuals();
    }

    isNight() {
        return this.timeOfDay >= 19.0 || this.timeOfDay < 6.0;
    }

    getPhaseName() {
        if (this.timeOfDay >= 5 && this.timeOfDay < 9) return "Dawn";
        if (this.timeOfDay >= 9 && this.timeOfDay < 17) return "Day";
        if (this.timeOfDay >= 17 && this.timeOfDay < 20) return "Dusk";
        return "Night";
    }

    updateUI() {
        if (!this.timeDisplay) return;
        
        const hours = Math.floor(this.timeOfDay);
        const mins = Math.floor((this.timeOfDay - hours) * 60);
        
        const ampm = hours >= 12 ? 'PM' : 'AM';
        let displayHour = hours % 12;
        if (displayHour === 0) displayHour = 12;
        
        const mm = mins.toString().padStart(2, '0');
        
        this.timeDisplay.innerText = `${displayHour}:${mm} ${ampm}`;
        this.dayPhaseDisplay.innerText = this.getPhaseName();
    }

    updateVisuals() {
        if (!this.nightOverlay) return;

        // Calculate darkness opacity
        let opacity = 0;
        
        if (this.timeOfDay >= 18 && this.timeOfDay < 20) {
            // Fade in night
            opacity = (this.timeOfDay - 18) / 2.0;
        } else if (this.timeOfDay >= 20 || this.timeOfDay < 5) {
            // Full night
            opacity = 1.0;
        } else if (this.timeOfDay >= 5 && this.timeOfDay < 7) {
            // Fade out night
            opacity = 1.0 - ((this.timeOfDay - 5) / 2.0);
        }
        
        // Max darkness is 0.75 opacity so we can still see a little
        this.nightOverlay.style.opacity = (opacity * 0.75).toFixed(2);
    }
}
