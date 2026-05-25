/**
 * simulation.js - Event-driven world clock and mobile token state.
 * Gameplay time advances only through explicit turn-consuming actions.
 */

export const TURN_COST_MATRIX = Object.freeze({
    'Paved Highway': 1,
    'Main Highway': 1,
    'highway': 1,
    'Dirt Road': 2,
    'dirt_road': 2,
    'road': 2,
    'Plains': 2,
    'Lush Plains': 2,
    'Forest': 3,
    'Dense Forest': 3,
    'Swamp': 5,
    'Murky Swamp': 5,
    'Mountain': 999,
    'Craggy Peaks': 999,
    'Frozen Peaks': 999,
    'Rolling Hills': 3,
    'Coastal Beach': 2,
    'Arid Desert': 4,
    'Taiga / Boreal': 3,
    'Freshwater Lake': 999,
    'Deep Ocean': 999,
    'Shallow Ocean': 999,
    'river': 3,
    'lake': 999,
    'ocean': 999
});

const MINUTES_PER_TURN_COST = 10;

function clampCost(value) {
    if (!Number.isFinite(value)) return 999;
    return Math.max(1, Math.round(value));
}

export function getTurnCostForCell(cell, routeTag = null) {
    if (!cell) return 999;

    if (routeTag && TURN_COST_MATRIX[routeTag] !== undefined) {
        return TURN_COST_MATRIX[routeTag];
    }

    if (cell.water_type && cell.water_type !== 'none') {
        return TURN_COST_MATRIX[cell.water_type] ?? 999;
    }

    if (TURN_COST_MATRIX[cell.biome] !== undefined) {
        return TURN_COST_MATRIX[cell.biome];
    }

    return clampCost(cell.travel_cost ?? 2);
}

export class Simulation {
    constructor(options = {}) {
        this.currentTurn = options.currentTurn ?? 0;
        this.minuteOfDay = options.minuteOfDay ?? 8 * 60;
        this.tokenStates = new Map();
        this.turnListeners = [];

        this.timeDisplay = document.getElementById('timeDisplay');
        this.dayPhaseDisplay = document.getElementById('dayPhaseDisplay');
        this.nightOverlay = document.getElementById('nightOverlay');

        this.updateUI();
    }

    initializeMobileTokens(tokens = []) {
        this.tokenStates.clear();
        tokens.forEach(token => {
            this.tokenStates.set(token.id, {
                routeProgress: 0,
                movementRate: token.type === 'patrol' ? 0.75 : 0.45
            });
        });
    }

    onTurn(listener) {
        this.turnListeners.push(listener);
    }

    advanceTurn(actionType, cost = 1, context = {}) {
        const turnCost = clampCost(cost);
        if (turnCost >= 999) {
            return {
                ok: false,
                actionType,
                cost: turnCost,
                reason: 'impassable'
            };
        }

        this.currentTurn += turnCost;
        this.minuteOfDay = (this.minuteOfDay + turnCost * MINUTES_PER_TURN_COST) % (24 * 60);
        this.advanceMobileTokens(turnCost);
        this.updateUI();

        const event = {
            ok: true,
            actionType,
            cost: turnCost,
            currentTurn: this.currentTurn,
            timeString: this.getTimeString(),
            phase: this.getPhaseName(),
            context
        };

        this.turnListeners.forEach(listener => listener(event));
        return event;
    }

    advanceMobileTokens(turnCost) {
        this.tokenStates.forEach(state => {
            state.routeProgress += turnCost * state.movementRate;
        });
    }

    getMobileTokenPosition(token) {
        const route = Array.isArray(token.route) ? token.route : [];
        if (route.length === 0) {
            return { x: token.x ?? 0, y: token.y ?? 0, ratio: 0 };
        }

        const state = this.tokenStates.get(token.id) || { routeProgress: 0 };
        const wrapped = ((state.routeProgress % route.length) + route.length) % route.length;
        const index = Math.floor(wrapped);
        const nextIndex = (index + 1) % route.length;
        const ratio = wrapped - index;
        const current = route[index];
        const next = route[nextIndex] || current;

        return {
            x: current.x + (next.x - current.x) * ratio,
            y: current.y + (next.y - current.y) * ratio,
            ratio
        };
    }

    isNight() {
        const hour = Math.floor(this.minuteOfDay / 60);
        return hour >= 19 || hour < 6;
    }

    getPhaseName() {
        const hour = Math.floor(this.minuteOfDay / 60);
        if (hour >= 5 && hour < 9) return 'Dawn';
        if (hour >= 9 && hour < 17) return 'Day';
        if (hour >= 17 && hour < 20) return 'Dusk';
        return 'Night';
    }

    getTimeString() {
        const hours = Math.floor(this.minuteOfDay / 60);
        const mins = this.minuteOfDay % 60;
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayHour = hours % 12 === 0 ? 12 : hours % 12;
        return `${displayHour}:${mins.toString().padStart(2, '0')} ${ampm}`;
    }

    updateUI() {
        if (this.timeDisplay) {
            this.timeDisplay.textContent = this.getTimeString();
        }
        if (this.dayPhaseDisplay) {
            this.dayPhaseDisplay.textContent = `${this.getPhaseName()} / Turn ${this.currentTurn}`;
        }
        if (this.nightOverlay) {
            this.nightOverlay.style.opacity = this.isNight() ? '0.35' : '0';
        }
    }
}
