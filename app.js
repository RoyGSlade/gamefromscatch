/**
 * app.js - Main Application Coordinator (RPG Engine)
 * Orchestrates Canvas events, Simulation loops, Player movement,
 * and AI bridge interactions.
 */
import { WorldMap } from './world.js';
import { MapRenderer } from './renderer.js';
import { Player } from './player.js';
import { Simulation } from './simulation.js';
import { AIBridge } from './aiBridge.js';
import { LOD_TIERS } from './viewport.js';

// Dom Elements
const canvas = document.getElementById('mapCanvas');
const seedInput = document.getElementById('worldSeed');
const regenerateBtn = document.getElementById('regenerateBtn');
const styleButtons = document.querySelectorAll('.style-btn');
const searchInput = document.getElementById('searchCityInput');
const cityListContainer = document.getElementById('registryCityList');
const inspectorPanel = document.getElementById('inspectorPanel');
const inspectorContent = document.getElementById('inspectorContent');
const closeInspectorBtn = document.getElementById('closeInspectorBtn');

// Status Bar Elements
const lodText = document.getElementById('lodValue');
const territoryText = document.getElementById('territoryValue');
const biomeText = document.getElementById('biomeValue');
const coordsText = document.getElementById('coordsValue');

// Global Application State
let world = null;
let renderer = null;
let player = null;
let simulation = null;
let aiBridge = null;

let hoveredCity = null;
let hoveredBuilding = null;
let selectedCity = null;

let tooltipEl = null;
let cameraTween = null;
let lastFrameTime = performance.now();

// Mouse Drag State
let isDragging = false;
let startX = 0;
let startY = 0;

function init() {
    setupCanvas();
    createTooltip();
    
    simulation = new Simulation();
    
    // Seed and generate initial world
    generateNewWorld(seedInput.value || 'Eldoria');

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

function createTooltip() {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'city-tooltip';
    tooltipEl.style.display = 'none';
    document.body.appendChild(tooltipEl);
}

function handleResize() {
    setupCanvas();
    if (renderer) renderer.draw();
}

function generateNewWorld(seed) {
    const numCountries = parseInt(document.getElementById('countriesCount').value || 6, 10);
    const numCities = parseInt(document.getElementById('citiesCount').value || 32, 10);
    
    world = new WorldMap(256, 256, seed);
    world.generate(numCountries, numCities);
    
    renderer = new MapRenderer(canvas, world);
    
    // Drop player at capital of country 0
    const startCity = world.cities.find(c => c.isCapital);
    player = new Player(startCity.x, startCity.y, world);
    renderer.setPlayer(player);
    
    aiBridge = new AIBridge(player, simulation, world);

    // Reset UI selections
    hoveredCity = null;
    selectedCity = null;
    closeInspector();
    populateCityList(world.cities);
    
    renderer.draw();
}

/* --- Camera Navigation (Pan & Zoom) --- */
function setupMouseListeners() {
    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // left click only
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        cameraTween = null;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            renderer.viewport.pan(dx, dy);
            startX = e.clientX;
            startY = e.clientY;
            canvas.style.cursor = 'grabbing';
        } else {
            handleHover(e.clientX, e.clientY);
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (isDragging) {
            // Check if it was a tiny drag (basically a click)
            const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
            if (dist < 3) handleClick(e.clientX, e.clientY);
        }
        isDragging = false;
        canvas.style.cursor = hoveredCity || hoveredBuilding ? 'pointer' : 'grab';
    });

    canvas.addEventListener('click', (e) => {
        if (!isDragging) handleClick(e.clientX, e.clientY);
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
        tooltipEl.style.display = 'none';
    });

    // Zooming at cursor target
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        renderer.viewport.zoomAt(e.clientX, e.clientY, e.deltaY);
        cameraTween = null;
        updateStatusBar();
    }, { passive: false });

    // Handle double-clicking to fly into city
    canvas.addEventListener('dblclick', () => {
        if (hoveredCity) {
            flyTo(hoveredCity.x * renderer.cellSize, hoveredCity.y * renderer.cellSize, 10.0);
        }
    });
}

function handleHover(mx, my) {
    const { cellX, cellY, wx, wy } = renderer.screenToWorld(mx, my);
    updateStatusBar(cellX, cellY);

    const lod = renderer.viewport.currentLOD;
    hoveredCity = null;
    hoveredBuilding = null;
    let tooltipText = '';

    if (lod === LOD_TIERS.CITY && selectedCity) {
        // We are inspecting a city, check for buildings
        const planner = renderer.getCityPlanner(selectedCity);
        const cityWorldX = selectedCity.x * renderer.cellSize;
        const cityWorldY = selectedCity.y * renderer.cellSize;
        const scaleFactor = 160 / 1000;
        
        for (const b of planner.buildings) {
            const bx = cityWorldX + (b.x - 500) * scaleFactor;
            const by = cityWorldY + (b.y - 500) * scaleFactor;
            const bw = b.w * scaleFactor;
            const bh = b.h * scaleFactor;
            
            // simple AABB collision check
            if (wx >= bx - bw/2 && wx <= bx + bw/2 && wy >= by - bh/2 && wy <= by + bh/2) {
                hoveredBuilding = b;
                if (player.passivePerception >= b.obscurityRating) {
                    tooltipText = `<strong>${b.purpose}</strong><br><span style="font-size:0.7rem; color:var(--gold);">District: ${b.district} | Tier: ${b.tier}</span>`;
                } else {
                    tooltipText = `<strong>Unknown Building</strong>`;
                }
                break;
            }
        }
    } else {
        // World Map level - check for cities
        const threshold = 18 / renderer.viewport.camera.zoom;
        for (const city of world.cities) {
            const cx = city.x * renderer.cellSize;
            const cy = city.y * renderer.cellSize;
            if (Math.hypot(wx - cx, wy - cy) < Math.max(14, threshold)) {
                hoveredCity = city;
                const countryName = city.countryId !== -1 ? world.countries[city.countryId].baseName : 'Neutral Territory';
                tooltipText = `<strong>${city.name}</strong><br><span style="font-size:0.7rem; color:var(--text-muted);">${countryName}</span>`;
                break;
            }
        }
    }

    if (hoveredBuilding || hoveredCity) {
        canvas.style.cursor = 'pointer';
        tooltipEl.innerHTML = tooltipText;
        tooltipEl.style.left = `${mx}px`;
        tooltipEl.style.top = `${my - 20}px`;
        tooltipEl.style.display = 'block';
    } else {
        canvas.style.cursor = 'grab';
        tooltipEl.style.display = 'none';
    }
}

function handleClick(mx, my) {
    const { cellX, cellY } = renderer.screenToWorld(mx, my);
    const lod = renderer.viewport.currentLOD;

    if (lod === LOD_TIERS.CITY && hoveredBuilding && selectedCity) {
        // Player clicked an NPC building to interact
        aiBridge.openInteraction(selectedCity, hoveredBuilding);
    } else if (hoveredCity) {
        // Open Inspector for City
        inspectCity(hoveredCity);
    } else if (lod < LOD_TIERS.CITY) {
        // Pathfind player to cell
        player.setTarget(cellX, cellY);
    }
}

function updateStatusBar(cellX, cellY) {
    if (cellX !== undefined && cellY !== undefined) {
        if (cellX >= 0 && cellX < world.width && cellY >= 0 && cellY < world.height) {
            coordsText.textContent = `${cellX}, ${cellY}`;
            const cell = world.getCell(cellX, cellY);
            biomeText.textContent = cell.biome.name;
            
            if (cell.countryId !== -1 && world.countries[cell.countryId]) {
                territoryText.textContent = world.countries[cell.countryId].name;
                territoryText.style.color = world.countries[cell.countryId].color;
            } else {
                territoryText.textContent = cell.elevation < world.seaLevel ? 'Abyssal Oceans' : 'Wild Neutral Lands';
                territoryText.style.color = 'var(--text-muted)';
            }
        }
    }

    const zoom = renderer.viewport.camera.zoom;
    if (zoom < 1.0) lodText.textContent = `Continent`;
    else if (zoom < 3.5) lodText.textContent = `Country`;
    else if (zoom < 7.5) lodText.textContent = `Province`;
    else lodText.textContent = `City Survey`;
}

function setupUIListeners() {
    regenerateBtn.addEventListener('click', () => generateNewWorld(seedInput.value.trim() || 'Eldoria'));
    seedInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') generateNewWorld(seedInput.value.trim());
    });
    document.getElementById('countriesCount').addEventListener('input', (e) => document.getElementById('countriesVal').textContent = e.target.value);
    document.getElementById('citiesCount').addEventListener('input', (e) => document.getElementById('citiesVal').textContent = e.target.value);

    styleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            styleButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderer.setStyle(btn.dataset.style);
        });
    });

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        populateCityList(world.cities.filter(c => c.name.toLowerCase().includes(query)));
    });

    closeInspectorBtn.addEventListener('click', closeInspector);
}

function populateCityList(cities) {
    cityListContainer.innerHTML = '';
    if (cities.length === 0) return;

    cities.forEach(city => {
        const item = document.createElement('div');
        item.className = `city-item ${city.isCapital ? 'capital' : ''} ${selectedCity === city ? 'active' : ''}`;
        item.innerHTML = `
            <span class="city-item-name">${city.name}</span>
            <span class="city-item-tag">${city.isCapital ? 'Capital' : 'Town'}</span>
        `;
        item.addEventListener('click', () => {
            document.querySelectorAll('.city-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            inspectCity(city);
            flyTo(city.x * renderer.cellSize, city.y * renderer.cellSize, 10.0);
        });
        cityListContainer.appendChild(item);
    });
}

function inspectCity(city) {
    selectedCity = city;
    aiBridge.closeInteraction();
    
    const country = world.countries[city.countryId];
    const countryName = country ? country.name : 'Neutral Wilds';
    const countryColor = country ? country.color : '#94a3b8';

    inspectorContent.innerHTML = `
        <h3 class="inspector-title">${city.name}</h3>
        <div class="inspector-subtitle" style="--glow-color: ${countryColor}">
            ${city.isCapital ? 'Crown Capital' : 'Settlement'} of ${countryName}
        </div>
        
        <div class="inspector-stats">
            <div class="stat-box"><div class="stat-label">Population</div><div class="stat-val">${city.population.toLocaleString()}</div></div>
            <div class="stat-box"><div class="stat-label">Trade Goods</div><div class="stat-val">${city.tradeGoods.join(', ')}</div></div>
            <div class="stat-box"><div class="stat-label">Ruler</div><div class="stat-val">${city.ruler}</div></div>
            <div class="stat-box"><div class="stat-label">Local Biome</div><div class="stat-val">${city.biome}</div></div>
        </div>
        <div class="inspector-divider"></div>
        <p class="inspector-description">"${city.lore}"</p>
        <div style="margin-top: 24px;">
            <button class="btn btn-primary" id="flyToStreetsBtn" style="width:100%;">Survey Streets</button>
        </div>
    `;

    document.getElementById('flyToStreetsBtn').addEventListener('click', () => {
        flyTo(city.x * renderer.cellSize, city.y * renderer.cellSize, 10.0);
    });

    inspectorPanel.classList.add('open');
}

function closeInspector() {
    selectedCity = null;
    inspectorPanel.classList.remove('open');
    if (aiBridge) aiBridge.closeInteraction();
}

function flyTo(targetX, targetY, targetZoom) {
    const cam = renderer.viewport.camera;
    cameraTween = {
        startX: cam.x,
        startY: cam.y,
        startZoom: cam.zoom,
        targetX: targetX,
        targetY: targetY,
        targetZoom: targetZoom,
        duration: 80,
        currentFrame: 0
    };
}

function updateCameraTween() {
    if (!cameraTween) return;
    const t = cameraTween.currentFrame / cameraTween.duration;
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    
    const cam = renderer.viewport.camera;
    cam.x = cameraTween.startX + (cameraTween.targetX - cameraTween.startX) * ease;
    cam.y = cameraTween.startY + (cameraTween.targetY - cameraTween.startY) * ease;
    cam.zoom = cameraTween.startZoom + (cameraTween.targetZoom - cameraTween.startZoom) * ease;
    
    renderer.viewport.updateLOD();
    
    cameraTween.currentFrame++;
    if (cameraTween.currentFrame > cameraTween.duration) cameraTween = null;
}

function tick(now) {
    const dt = (now - lastFrameTime) / 1000.0; // delta time in seconds
    lastFrameTime = now;

    if (simulation) simulation.update(dt);
    if (player) player.update(dt);
    if (renderer) renderer.update();
    
    updateCameraTween();
    
    if (renderer) renderer.draw();
    
    requestAnimationFrame(tick);
}

window.onload = init;
