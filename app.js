/**
 * app.js - Main Application Coordinator
 * Fetches the deterministic map JSON from the FastAPI backend
 * and wires up mouse pans, zooms, inspections, and style toggles.
 */
import { MapRenderer } from './renderer.js';

// DOM Elements
const canvas = document.getElementById('mapCanvas');
const seedInput = document.getElementById('worldSeed');
const regenerateBtn = document.getElementById('regenerateBtn');
const styleButtons = document.querySelectorAll('.style-btn');
const searchInput = document.getElementById('searchCityInput');
const cityListContainer = document.getElementById('registryCityList');
const inspectorPanel = document.getElementById('inspectorPanel');
const inspectorContent = document.getElementById('inspectorContent');
const closeInspectorBtn = document.getElementById('closeInspectorBtn');
const poiDebugToggle = document.getElementById('poiDebugToggle');

// Status Bar Elements
const lodText = document.getElementById('lodValue');
const territoryText = document.getElementById('territoryValue');
const biomeText = document.getElementById('biomeValue');
const coordsText = document.getElementById('coordsValue');
const clockDisplay = document.getElementById('timeDisplay');
const dayPhaseDisplay = document.getElementById('dayPhaseDisplay');

// Application State
let world = null;       // Holds fetched JSON map state
let renderer = null;    // MapRenderer instance
let hoveredCity = null;
let selectedCity = null;
let isDragging = false;
let startX = 0;
let startY = 0;
let lastFrameTime = performance.now();

function init() {
    setupCanvas();
    
    // Seed and generate initial world
    const seed = seedInput.value || 'Eldoria';
    generateNewWorld(seed);

    window.addEventListener('resize', handleResize);
    setupMouseListeners();
    setupUIListeners();

    requestAnimationFrame(tick);
}

function setupCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (renderer) renderer.viewport.resize(canvas.width, canvas.height);
}

function handleResize() {
    setupCanvas();
    if (renderer) renderer.draw();
}

/**
 * Fetches deterministic world generation data from the FastAPI backend.
 */
async function generateNewWorld(seed) {
    try {
        console.log(`Requesting world slice for seed: "${seed}"...`);
        const response = await fetch(`http://127.0.0.1:8000/api/world/generate?seed=${encodeURIComponent(seed)}`);
        
        if (!response.ok) {
            throw new Error(`Server returned status: ${response.status}`);
        }
        
        world = await response.json();
        console.log("Successfully loaded world slice:", world);
        
        renderer = new MapRenderer(canvas, world);
        
        // Reset selections
        hoveredCity = null;
        selectedCity = null;
        closeInspector();
        populateCityList(world.settlements);
        
        renderer.draw();
        
    } catch (err) {
        console.error("Failed to fetch world from backend. Make sure the backend server is running on port 8000.", err);
        alert("Could not connect to the backend server. Please run npm start or double-click run.bat!");
    }
}

/* --- Mouse Event Listeners for Cartographic Navigation --- */
function setupMouseListeners() {
    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Left click only
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (renderer) {
                renderer.viewport.pan(dx, dy);
                renderer.draw();
            }
            startX = e.clientX;
            startY = e.clientY;
            canvas.style.cursor = 'grabbing';
        } else {
            handleHover(e.clientX, e.clientY);
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (isDragging) {
            isDragging = false;
        } else {
            handleClick(e.clientX, e.clientY);
        }
        canvas.style.cursor = hoveredCity ? 'pointer' : 'grab';
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
    });

    // Zooming focused on mouse cursor coordinates
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (renderer) {
            renderer.viewport.zoomAt(e.clientX, e.clientY, e.deltaY);
            renderer.draw();
            updateStatusBar();
        }
    }, { passive: false });
}

function handleHover(mx, my) {
    if (!renderer || !world) return;
    
    const { cellX, cellY, wx, wy } = renderer.screenToWorld(mx, my);
    updateStatusBar(cellX, cellY);

    hoveredCity = null;
    const threshold = 18 / renderer.viewport.camera.zoom;

    // Check if hovering over any settlements
    for (const settle of world.settlements) {
        const cx = settle.x * renderer.cellSize;
        const cy = settle.y * renderer.cellSize;
        if (Math.hypot(wx - cx, wy - cy) < Math.max(14, threshold)) {
            hoveredCity = settle;
            break;
        }
    }

    canvas.style.cursor = hoveredCity ? 'pointer' : 'grab';
}

function handleClick(mx, my) {
    if (!renderer || !world) return;
    if (hoveredCity) {
        inspectCity(hoveredCity);
    } else {
        closeInspector();
    }
}

function updateStatusBar(cellX, cellY) {
    if (!renderer || !world) return;

    if (cellX !== undefined && cellY !== undefined) {
        if (cellX >= 0 && cellX < world.width && cellY >= 0 && cellY < world.height) {
            coordsText.textContent = `${cellX}, ${cellY}`;
            const cell = world.cells[cellY * world.width + cellX];
            if (cell) {
                biomeText.textContent = cell.biome;
                
                if (cell.water_type !== 'none') {
                    territoryText.textContent = `Water (${cell.water_type.toUpperCase()})`;
                    territoryText.style.color = '#38bdf8';
                } else {
                    territoryText.textContent = 'Wild Frontier';
                    territoryText.style.color = 'var(--gold)';
                }
            }
        }
    }

    const zoom = renderer.viewport.camera.zoom;
    if (zoom < 0.6) lodText.textContent = `Continent`;
    else if (zoom < 2.0) lodText.textContent = `Province`;
    else if (zoom < 5.0) lodText.textContent = `Settlement Survey`;
    else lodText.textContent = `Detail Survey`;
}

function setupUIListeners() {
    regenerateBtn.addEventListener('click', () => {
        const seed = seedInput.value.trim();
        if (seed) generateNewWorld(seed);
    });

    seedInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const seed = seedInput.value.trim();
            if (seed) generateNewWorld(seed);
        }
    });

    styleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            styleButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (renderer) renderer.setStyle(btn.dataset.style);
        });
    });

    poiDebugToggle.addEventListener('change', () => {
        if (renderer) renderer.draw();
    });

    searchInput.addEventListener('input', (e) => {
        if (!world) return;
        const query = e.target.value.toLowerCase().trim();
        populateCityList(world.settlements.filter(s => s.name.toLowerCase().includes(query)));
    });

    closeInspectorBtn.addEventListener('click', closeInspector);
}

function populateCityList(settlements) {
    cityListContainer.innerHTML = '';
    if (!settlements || settlements.length === 0) return;

    settlements.forEach(settle => {
        const item = document.createElement('div');
        item.className = `city-item ${settle.type === 'town' ? 'capital' : ''} ${selectedCity === settle ? 'active' : ''}`;
        
        const label = settle.type === 'town' ? 'Town' : 'Outpost';
        item.innerHTML = `
            <span class="city-item-name">${settle.name}</span>
            <span class="city-item-tag">${label}</span>
        `;
        
        item.addEventListener('click', () => {
            document.querySelectorAll('.city-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            inspectCity(settle);
            
            // Pan camera smoothly to coordinates
            if (renderer) {
                renderer.viewport.camera.x = settle.x * renderer.cellSize;
                renderer.viewport.camera.y = settle.y * renderer.cellSize;
                renderer.viewport.camera.zoom = 2.5; // fly in zoom
                renderer.viewport.updateLOD();
                renderer.draw();
                updateStatusBar(settle.x, settle.y);
            }
        });
        cityListContainer.appendChild(item);
    });
}

function inspectCity(settle) {
    selectedCity = settle;
    
    const goodsStr = settle.resources.join(', ');
    const label = settle.type === 'town' ? 'Sovereign Town' : 'Industrial Outpost';
    
    inspectorContent.innerHTML = `
        <h3 class="inspector-title">${settle.name}</h3>
        <div class="inspector-subtitle" style="--glow-color: var(--gold)">
            ${label}
        </div>
        
        <div class="inspector-stats">
            <div class="stat-box"><div class="stat-label">Population</div><div class="stat-val">${settle.population.toLocaleString()}</div></div>
            <div class="stat-box"><div class="stat-label">Ruler</div><div class="stat-val">${settle.ruler}</div></div>
            <div class="stat-box"><div class="stat-label">Local Goods</div><div class="stat-val">${goodsStr}</div></div>
        </div>
        <div class="inspector-divider"></div>
        <p class="inspector-description" style="font-style: italic; color: var(--gold);">
            Origin Cause: "${settle.origin_reason}"
        </p>
        <p class="inspector-description">"${settle.lore}"</p>
    `;
    inspectorPanel.classList.add('open');
}

function closeInspector() {
    selectedCity = null;
    inspectorPanel.classList.remove('open');
    inspectorContent.innerHTML = `
        <div class="no-selection-msg">
            <p>💡 Click on any settlement node or select it from the Registry list to inspect its logs.</p>
        </div>
    `;
}

function tick(now) {
    const dt = (now - lastFrameTime) / 1000.0;
    lastFrameTime = now;

    if (renderer && world) {
        renderer.update();
        renderer.draw();
        
        // Dynamic game time ticks purely on the client side for aesthetics
        const totalMinutes = Math.floor(now * 0.02) % (24 * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 === 0 ? 12 : hours % 12;
        const padMins = minutes.toString().padStart(2, '0');
        clockDisplay.textContent = `${displayHours}:${padMins} ${ampm}`;
        
        let phase = "Morning";
        if (hours >= 18) phase = "Night";
        else if (hours >= 12) phase = "Afternoon";
        else if (hours >= 6) phase = "Morning";
        else phase = "Midnight";
        dayPhaseDisplay.textContent = phase;
    }
    
    requestAnimationFrame(tick);
}

window.onload = init;
