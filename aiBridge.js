/**
 * aiBridge.js - Local LLM context packaging and mock response routing.
 */

function safeList(value) {
    return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function deterministicRoll(seedText) {
    let hash = 0;
    for (let i = 0; i < seedText.length; i++) {
        hash = ((hash << 5) - hash + seedText.charCodeAt(i)) | 0;
    }
    return Math.abs(hash % 20) + 1;
}

export class AIBridge {
    constructor({ player, simulation, world }) {
        this.player = player;
        this.simulation = simulation;
        this.world = world;
        this.currentBuilding = null;
        this.currentSettlement = null;
        this.currentLayout = null;

        this.panel = document.getElementById('interactionPanel');
        this.logArea = document.getElementById('interactionLog');
        this.actionInput = document.getElementById('actionInput');
        this.actionBtn = document.getElementById('actionBtn');
        this.closeBtn = document.getElementById('closeInteractionBtn');

        this.actionBtn?.addEventListener('click', () => this.handlePlayerAction());
        this.closeBtn?.addEventListener('click', () => this.closeInteraction());
        this.actionInput?.addEventListener('keydown', event => {
            if (event.key === 'Enter') this.handlePlayerAction();
        });
    }

    openInteraction(settlement, building, layout) {
        this.currentSettlement = settlement;
        this.currentBuilding = building;
        this.currentLayout = layout;

        if (!this.panel || !this.logArea) return;

        this.panel.classList.add('open');
        this.logArea.innerHTML = '';

        const locked = this.simulation.isNight() && building.locked_at_night;
        if (this.actionInput) {
            this.actionInput.disabled = locked;
            this.actionInput.value = '';
        }
        if (this.actionBtn) {
            this.actionBtn.disabled = locked;
        }

        const payload = this.generateStatePayload();
        console.info('LLM Context Payload generated:', JSON.stringify(payload, null, 2));

        this.logSystem(`Entered ${building.name}.`);
        if (locked) {
            this.logSystem('The building is locked for the night.');
        } else {
            this.logNPC(`You are in ${building.purpose || building.type}. What do you do?`);
            this.actionInput?.focus();
        }
    }

    closeInteraction() {
        this.panel?.classList.remove('open');
        this.currentBuilding = null;
        this.currentSettlement = null;
        this.currentLayout = null;
    }

    generateStatePayload(actionText = null) {
        const building = this.currentBuilding || {};
        const settlement = this.currentSettlement || {};
        const layout = this.currentLayout || {};
        const jobs = safeList(layout.job_slots).filter(job => safeList(building.job_slots).includes(job.id));
        const maxEmployees = jobs.reduce((sum, job) => sum + (job.count || 0), 0);
        const cell = this.world.cells?.[building.y * this.world.width + building.x] || null;

        return {
            world_state: {
                current_turn: this.simulation.currentTurn,
                time_string: this.simulation.getTimeString(),
                phase: this.simulation.getPhaseName()
            },
            player: {
                level: this.player.level,
                reputation: this.player.reputation,
                passivePerception: this.player.passivePerception,
                position: { x: this.player.cellX, y: this.player.cellY }
            },
            local_environment: {
                settlement_id: settlement.id,
                settlement_name: settlement.name,
                settlement_type: settlement.type,
                biome: cell?.biome ?? 'Unknown',
                water_type: cell?.water_type ?? 'none',
                resources: cell?.resources ?? []
            },
            target_building: {
                id: building.id,
                name: building.name,
                purpose: building.purpose || building.type,
                type: building.type,
                tier: building.tier,
                max_employees: maxEmployees,
                max_residents: building.max_residents ?? 0,
                current_occupants: building.current_occupants ?? [],
                inventory_tier_cap: building.inventory_tier_cap ?? building.tier,
                storage_volume_limit: building.storage_volume_limit ?? 0,
                price_modifier: building.price_modifier ?? 1,
                locked_status: this.simulation.isNight() && !!building.locked_at_night,
                obscurity_rating: building.obscurity_rating ?? 0,
                requires: safeList(building.requires),
                produces: safeList(building.produces),
                consumes: safeList(building.consumes)
            },
            action: actionText,
            expected_output_type: 'json'
        };
    }

    handlePlayerAction() {
        const actionText = this.actionInput?.value.trim();
        if (!actionText) return;

        this.logPlayer(actionText);
        this.actionInput.value = '';

        const payload = this.generateStatePayload(actionText);
        console.info('Sending to local model:', JSON.stringify(payload, null, 2));

        this.simulation.advanceTurn('interaction', 1, {
            building_id: this.currentBuilding?.id,
            action: actionText
        });
        this.mockLLMResponse(actionText);
    }

    mockLLMResponse(text) {
        const lower = text.toLowerCase();
        let dialogue = 'The room settles as your action is considered.';

        if (lower.includes('buy') || lower.includes('trade') || lower.includes('shop')) {
            const price = (this.currentBuilding?.price_modifier ?? 1).toFixed(2);
            dialogue = `Standard prices are currently running at ${price}x.`;
        } else if (lower.includes('threat') || lower.includes('rob')) {
            const roll = deterministicRoll(`${text}:${this.simulation.currentTurn}:${this.currentBuilding?.id}`);
            dialogue = roll >= 13
                ? `The pressure works. The local staff back down after a roll of ${roll}.`
                : `The attempt fails on a roll of ${roll}. Guards will hear about this.`;
            if (roll < 13) this.player.reputation -= 5;
        } else if (lower.includes('leave') || lower.includes('bye')) {
            dialogue = 'You step back from the conversation.';
            window.setTimeout(() => this.closeInteraction(), 600);
        }

        this.logNPC(dialogue);
    }

    logSystem(message) {
        this.appendLog('system', `[System] ${message}`);
    }

    logPlayer(message) {
        this.appendLog('player', `You: ${message}`);
    }

    logNPC(message) {
        this.appendLog('npc', `NPC: "${message}"`);
    }

    appendLog(type, message) {
        if (!this.logArea) return;
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerHTML = escapeHtml(message);
        this.logArea.appendChild(entry);
        this.logArea.scrollTop = this.logArea.scrollHeight;
    }
}
