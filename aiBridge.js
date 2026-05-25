/**
 * aiBridge.js - Local LLM & RPG Interaction Hook
 * Generates JSON payloads for Local LLMs to understand the RPG state.
 * Contains a mock parser to demonstrate Intent parsing and consequence triggering.
 */

export class AIBridge {
    constructor(player, simulation, worldMap) {
        this.player = player;
        this.sim = simulation;
        this.world = worldMap;
        
        // UI
        this.panel = document.getElementById('interactionPanel');
        this.logArea = document.getElementById('interactionLog');
        this.actionInput = document.getElementById('actionInput');
        this.actionBtn = document.getElementById('actionBtn');
        
        this.currentBuilding = null;
        this.currentCity = null;
        
        if (this.actionBtn) {
            this.actionBtn.addEventListener('click', () => this.handlePlayerAction());
        }
        if (this.actionInput) {
            this.actionInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handlePlayerAction();
            });
        }
    }

    openInteraction(city, building) {
        this.currentCity = city;
        this.currentBuilding = building;
        
        // Show panel
        if (this.panel) this.panel.classList.add('active');
        if (this.logArea) this.logArea.innerHTML = '';
        
        // Check if locked
        if (this.sim.isNight() && building.lockedAtNight) {
            this.logSystem(`The ${building.purpose} door is locked and bolted for the night.`);
            if (this.actionInput) this.actionInput.disabled = true;
            if (this.actionBtn) this.actionBtn.disabled = true;
            return;
        }

        if (this.actionInput) {
            this.actionInput.disabled = false;
            this.actionInput.value = '';
            this.actionInput.focus();
        }
        if (this.actionBtn) this.actionBtn.disabled = false;

        // Generate Context Payload for LLM
        const contextPayload = this.generateStatePayload();
        console.log("LLM Context Payload generated:", JSON.stringify(contextPayload, null, 2));
        
        this.logSystem(`Entered ${building.purpose} in the ${building.district} district.`);
        this.logNPC(`Welcome to my ${building.purpose.toLowerCase()}. What do you need?`);
    }

    closeInteraction() {
        if (this.panel) this.panel.classList.remove('active');
        this.currentBuilding = null;
    }

    generateStatePayload() {
        return {
            "world": {
                "time": this.sim.timeOfDay.toFixed(2),
                "phase": this.sim.getPhaseName(),
                "city": this.currentCity.name,
                "ruler": this.currentCity.ruler
            },
            "player": {
                "level": this.player.level,
                "reputation": this.player.reputation,
                "passivePerception": this.player.passivePerception
            },
            "npc": {
                "id": this.currentBuilding.npcSeed,
                "location": this.currentBuilding.purpose,
                "tier": this.currentBuilding.tier,
                "priceModifier": this.currentBuilding.priceMod
            },
            "prompt": "You are the NPC defined above. Respond to the player's action in character."
        };
    }

    handlePlayerAction() {
        if (!this.actionInput) return;
        const actionText = this.actionInput.value.trim();
        if (!actionText) return;
        
        this.logPlayer(actionText);
        this.actionInput.value = '';

        // Generate Player Action Payload
        const actionPayload = {
            "action": actionText,
            "expectedOutputType": "json",
            "schema": {
                "dialogue": "string",
                "intent": "enum: [trade, combat, threaten, info, leave]",
                "reputationChange": "number"
            }
        };
        console.log("Sending to LLM:", JSON.stringify(actionPayload, null, 2));

        // MOCK LLM PARSER
        setTimeout(() => this.mockLLMResponse(actionText), 600);
    }

    mockLLMResponse(text) {
        const lower = text.toLowerCase();
        let intent = "info";
        let dialogue = "I'm just a humble worker. What can I tell you?";
        let repChange = 0;

        if (lower.includes('threat') || lower.includes('kill') || lower.includes('rob')) {
            intent = "threaten";
            dialogue = "Guards! Help! We have a bandit!";
            repChange = -15;
        } else if (lower.includes('buy') || lower.includes('trade') || lower.includes('shop')) {
            intent = "trade";
            dialogue = `Take a look at my wares. Since you look decent, I'll only charge ${this.currentBuilding.priceMod.toFixed(1)}x normal prices.`;
        } else if (lower.includes('leave') || lower.includes('bye')) {
            intent = "leave";
            dialogue = "Safe travels on the roads.";
        }

        // Apply Consequences
        this.logNPC(dialogue);
        
        if (repChange !== 0) {
            this.player.reputation += repChange;
            this.logSystem(`Reputation changed by ${repChange}. Current: ${this.player.reputation}`);
        }

        if (intent === 'threaten') {
            this.logSystem("🎲 [Intimidation Roll Required]");
            const roll = Math.floor(Math.random() * 20) + 1;
            this.logSystem(`🎲 You rolled a ${roll}!`);
            if (roll > 12) {
                this.logSystem("Success! The NPC cowers and hands over 50 gold.");
            } else {
                this.logSystem("Failure! The city guards have been alerted!");
            }
        }

        if (intent === 'leave') {
            setTimeout(() => this.closeInteraction(), 1500);
        }
    }

    logSystem(msg) {
        this.appendLog(`<span class="log-entry system">[System] ${msg}</span>`);
    }

    logPlayer(msg) {
        this.appendLog(`<span class="log-entry player">You: ${msg}</span>`);
    }

    logNPC(msg) {
        this.appendLog(`<span class="log-entry npc">NPC: "${msg}"</span>`);
    }

    appendLog(html) {
        if (!this.logArea) return;
        this.logArea.innerHTML += html;
        this.logArea.scrollTop = this.logArea.scrollHeight;
    }
}
