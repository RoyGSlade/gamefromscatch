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
const districtsToggle = document.getElementById('districtsToggle');
const productionToggle = document.getElementById('productionToggle');
const jobsToggle = document.getElementById('jobsToggle');
const districtLabelsToggle = document.getElementById('districtLabelsToggle');
const tokenRoutesToggle = document.getElementById('tokenRoutesToggle');

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
let inspectedType = null; // 'settlement', 'district', 'building'
let inspectedData = null;
let inspectedLayout = null;

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
        const response = await fetch(`/api/world/generate?seed=${encodeURIComponent(seed)}`);
        
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

    // Prevent default browser context menu on right-click to avoid annoying Chrome "Copy image" popups
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

function handleHover(mx, my) {
    if (!renderer || !world) return;
    
    const { cellX, cellY, wx, wy } = renderer.screenToWorld(mx, my);
    updateStatusBar(cellX, cellY);

    hoveredCity = null;
    renderer.hoveredBuilding = null;
    renderer.hoveredDistrict = null;
    renderer.hoveredToken = null;
    
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

    // If zoomed in and not hovering a settlement, check details
    if (!hoveredCity && renderer.viewport.camera.zoom >= 1.5 && world.settlement_layouts) {
        // 1. Check if hovering a building
        for (const layout of world.settlement_layouts) {
            for (const bld of layout.buildings) {
                if (cellX >= bld.x && cellX < bld.x + bld.width &&
                    cellY >= bld.y && cellY < bld.y + bld.height) {
                    renderer.hoveredBuilding = bld;
                    break;
                }
            }
            if (renderer.hoveredBuilding) break;
        }

        // 2. Check if hovering a district
        if (!renderer.hoveredBuilding) {
            const showDistricts = districtsToggle ? districtsToggle.checked : false;
            if (showDistricts) {
                for (const layout of world.settlement_layouts) {
                    for (const dist of layout.districts) {
                        if (Math.hypot(cellX - dist.x, cellY - dist.y) <= dist.radius) {
                            renderer.hoveredDistrict = dist;
                            break;
                        }
                    }
                    if (renderer.hoveredDistrict) break;
                }
            }
        }

        // 3. Check if hovering a mobile token
        if (!renderer.hoveredBuilding && !renderer.hoveredDistrict) {
            for (const tok of world.mobile_tokens) {
                const speed = tok.type === 'caravan' ? 0.08 : 0.15;
                const index = Math.floor(renderer.animFrame * speed) % tok.route.length;
                const p = tok.route[index] || { x: tok.x, y: tok.y };
                
                const tcx = p.x * renderer.cellSize + renderer.cellSize/2;
                const tcy = p.y * renderer.cellSize + renderer.cellSize/2;
                
                // Hover threshold in world units
                const dist = Math.hypot(wx - tcx, wy - tcy) * renderer.viewport.camera.zoom;
                if (dist < 12) {
                    renderer.hoveredToken = tok;
                    break;
                }
            }
        }
    }

    canvas.style.cursor = (hoveredCity || renderer.hoveredBuilding || renderer.hoveredDistrict || renderer.hoveredToken) ? 'pointer' : 'grab';
}

function handleClick(mx, my) {
    if (!renderer || !world) return;
    
    const { cellX, cellY } = renderer.screenToWorld(mx, my);
    const zoom = renderer.viewport.camera.zoom;
    
    if (hoveredCity) {
        inspectCity(hoveredCity);
        return;
    }
    
    // If zoomed in, check for building or district clicks
    if (zoom >= 1.5 && world.settlement_layouts) {
        let clickedBuilding = null;
        let clickedDistrict = null;
        let clickedLayout = null;
        
        for (const layout of world.settlement_layouts) {
            for (const bld of layout.buildings) {
                if (cellX >= bld.x && cellX < bld.x + bld.width &&
                    cellY >= bld.y && cellY < bld.y + bld.height) {
                    clickedBuilding = bld;
                    clickedLayout = layout;
                    break;
                }
            }
            if (clickedBuilding) break;
        }
        
        if (!clickedBuilding) {
            for (const layout of world.settlement_layouts) {
                for (const dist of layout.districts) {
                    if (Math.hypot(cellX - dist.x, cellY - dist.y) <= dist.radius) {
                        clickedDistrict = dist;
                        clickedLayout = layout;
                        break;
                    }
                }
                if (clickedDistrict) break;
            }
        }
        
        if (clickedBuilding) {
            inspectBuilding(clickedBuilding, clickedLayout);
            return;
        } else if (clickedDistrict) {
            inspectDistrict(clickedDistrict, clickedLayout);
            return;
        }
    }
    
    closeInspector();
}

function updateStatusBar(cellX, cellY) {
    if (!renderer || !world) return;

    if (cellX !== undefined && cellY !== undefined) {
        if (cellX >= 0 && cellX < world.width && cellY >= 0 && cellY < world.height) {
            coordsText.textContent = `${cellX}, ${cellY}`;
            const cell = world.cells[cellY * world.width + cellX];
            if (cell) {
                biomeText.textContent = cell.biome;
                
                let hoverBuilding = null;
                let hoverDistrict = null;
                if (world.settlement_layouts) {
                    for (const layout of world.settlement_layouts) {
                        for (const bld of layout.buildings) {
                            if (cellX >= bld.x && cellX < bld.x + bld.width &&
                                cellY >= bld.y && cellY < bld.y + bld.height) {
                                hoverBuilding = bld;
                                break;
                            }
                        }
                        if (hoverBuilding) break;
                        
                        for (const dist of layout.districts) {
                            if (Math.hypot(cellX - dist.x, cellY - dist.y) <= dist.radius) {
                                hoverDistrict = dist;
                                break;
                            }
                        }
                        if (hoverDistrict) break;
                    }
                }
                
                if (hoverBuilding) {
                    territoryText.textContent = `${hoverBuilding.name} (Tier ${hoverBuilding.tier})`;
                    territoryText.style.color = '#fbbf24';
                } else if (hoverDistrict) {
                    const formattedDist = hoverDistrict.type.toUpperCase().replace("_", " ");
                    territoryText.textContent = `${formattedDist} DISTRICT`;
                    territoryText.style.color = '#a78bfa';
                } else if (cell.water_type !== 'none') {
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

    districtsToggle.addEventListener('change', () => {
        if (renderer) renderer.draw();
        refreshInspector();
    });

    districtLabelsToggle.addEventListener('change', () => {
        if (renderer) renderer.draw();
    });

    productionToggle.addEventListener('change', () => {
        if (renderer) renderer.draw();
        refreshInspector();
    });

    jobsToggle.addEventListener('change', () => {
        if (renderer) renderer.draw();
        refreshInspector();
    });

    tokenRoutesToggle.addEventListener('change', () => {
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
    inspectedType = 'settlement';
    inspectedData = settle;
    inspectedLayout = world.settlement_layouts ? world.settlement_layouts.find(l => l.settlement_id === settle.id) : null;
    
    if (renderer) {
        renderer.selectedBuilding = null;
        renderer.draw();
    }
    
    const goodsStr = settle.resources.join(', ');
    const label = settle.type === 'town' ? 'Sovereign Town' : 'Industrial Outpost';
    
    let html = `
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
    
    // If districtsToggle is checked (Show Districts) and we have a layout, let's list the districts in the settlement!
    if (districtsToggle && districtsToggle.checked && inspectedLayout) {
        html += `
            <div class="inspector-divider"></div>
            <h4 style="color: var(--gold); font-family: var(--font-serif); margin-top: 12px; margin-bottom: 8px;">Settlement Districts</h4>
            <div style="display: flex; flex-direction: column; gap: 6px;">
        `;
        inspectedLayout.districts.forEach(dist => {
            const formattedType = dist.type.replace("_", " ").toUpperCase();
            html += `
                <div class="district-inspect-item" style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer;" onclick="window.inspectDistrictById('${dist.id}')">
                    <div style="display: flex; justify-content: space-between; font-weight: 500;">
                        <span style="color: var(--gold);">${formattedType}</span>
                        <span style="color: #a78bfa; font-size: 0.8rem;">Wealth: ${dist.wealth_level}</span>
                    </div>
                    <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 4px;">Danger Level: ${Math.round(dist.local_danger_level * 100)}%</div>
                </div>
            `;
        });
        html += `</div>`;
    }
    
    inspectorContent.innerHTML = html;
    inspectorPanel.classList.add('open');
}

function inspectBuilding(bld, layout) {
    inspectedType = 'building';
    inspectedData = bld;
    inspectedLayout = layout;
    selectedCity = world.settlements.find(s => s.id === layout.settlement_id);
    
    if (renderer) {
        renderer.selectedBuilding = bld;
        renderer.draw();
    }
    
    let html = `
        <h3 class="inspector-title">${bld.name}</h3>
        <div class="inspector-subtitle" style="--glow-color: #fbbf24">
            ${bld.type.toUpperCase().replace("_", " ")} - Tier ${bld.tier}
        </div>
        
        <div class="inspector-stats" style="grid-template-columns: repeat(2, 1fr);">
            <div class="stat-box"><div class="stat-label">Settlement</div><div class="stat-val">${selectedCity.name}</div></div>
            <div class="stat-box"><div class="stat-label">Condition</div><div class="stat-val">${Math.round(bld.condition * 100)}%</div></div>
            <div class="stat-box"><div class="stat-label">Obscurity</div><div class="stat-val">${bld.obscurity_rating}</div></div>
            <div class="stat-box"><div class="stat-label">Price Mod</div><div class="stat-val">${bld.price_modifier.toFixed(2)}x</div></div>
        </div>
        
        <div class="inspector-divider"></div>
        <p class="inspector-description" style="font-weight: 500;">
            Purpose: <span style="color: #94a3b8; font-weight: normal;">${bld.purpose}</span>
        </p>
        <p class="inspector-description" style="font-style: italic; color: var(--gold);">
            Origin Cause: "${bld.origin_reasons.join(', ')}"
        </p>
    `;
    
    if (productionToggle && productionToggle.checked) {
        html += `
            <div class="inspector-divider"></div>
            <h4 style="color: var(--gold); font-family: var(--font-serif); margin-top: 12px; margin-bottom: 8px;">Production & Logistics</h4>
            <div style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); font-size: 0.85rem;">
                <div style="margin-bottom: 6px;"><strong style="color: #f59e0b;">Consumes:</strong> ${bld.consumes.length > 0 ? bld.consumes.join(', ') : 'None'}</div>
                <div style="margin-bottom: 6px;"><strong style="color: #60a5fa;">Requires:</strong> ${bld.requires.length > 0 ? bld.requires.join(', ') : 'None'}</div>
                <div style="margin-bottom: 6px;"><strong style="color: #34d399;">Produces:</strong> ${bld.produces.length > 0 ? bld.produces.join(', ') : 'None'}</div>
        `;
        
        const chains = layout.production_chains.filter(c => c.buildings_involved.includes(bld.id));
        if (chains.length > 0) {
            html += `
                <div style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                    <div style="font-weight: bold; color: var(--gold); font-size: 0.85rem; margin-bottom: 4px;">Supply Chain Map:</div>
            `;
            chains.forEach(chain => {
                const inputsStr = chain.inputs.join(', ') || 'Raw Nature';
                const outputsStr = chain.outputs.join(', ');
                html += `
                    <div style="font-size: 0.8rem; background: rgba(0,0,0,0.2); padding: 6px; border-radius: 4px; margin-bottom: 6px;">
                        <div><span style="color: #94a3b8;">Inputs:</span> ${inputsStr}</div>
                        <div style="margin: 2px 0; color: #a78bfa; font-weight: bold;">➔ [${chain.processors.join(' ➔ ')}] ➔</div>
                        <div><span style="color: #34d399; font-weight: bold;">Outputs:</span> ${outputsStr}</div>
                        ${chain.bottlenecks.length > 0 ? `<div style="color: #f87171; font-size: 0.75rem; margin-top: 4px;">⚠️ Bottleneck: ${chain.bottlenecks.join(', ')}</div>` : ''}
                    </div>
                `;
            });
            html += `</div>`;
        }
        html += `</div>`;
    }
    
    if (jobsToggle && jobsToggle.checked) {
        const jobs = layout.job_slots.filter(j => bld.job_slots.includes(j.id));
        html += `
            <div class="inspector-divider"></div>
            <h4 style="color: var(--gold); font-family: var(--font-serif); margin-top: 12px; margin-bottom: 8px;">Labor & Job Slots</h4>
            <div style="display: flex; flex-direction: column; gap: 6px;">
        `;
        if (jobs.length > 0) {
            jobs.forEach(job => {
                html += `
                    <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); font-size: 0.85rem;">
                        <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 2px;">
                            <span style="color: #60a5fa;">${job.role} (x${job.count})</span>
                            <span style="color: #f59e0b;">${'★'.repeat(job.social_importance)}${'☆'.repeat(5-job.social_importance)}</span>
                        </div>
                        <div style="color: #94a3b8; font-size: 0.8rem;">Skills: ${job.required_skills.join(', ')}</div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">
                            <span>Danger: ${(job.danger_level * 100).toFixed(0)}%</span>
                            <span>Shift: ${job.schedule_template}</span>
                        </div>
                    </div>
                `;
            });
        } else {
            html += `<div style="font-size: 0.85rem; color: #94a3b8; font-style: italic;">No active job slots.</div>`;
        }
        html += `</div>`;
    }
    
    html += `
        <div class="inspector-divider"></div>
        <button class="btn btn-primary" style="margin-top: 8px; width: 100%;" onclick="window.inspectCityById('${selectedCity.id}')">➔ View Settlement Overview</button>
    `;
    
    inspectorContent.innerHTML = html;
    inspectorPanel.classList.add('open');
}

function inspectDistrict(dist, layout) {
    inspectedType = 'district';
    inspectedData = dist;
    inspectedLayout = layout;
    selectedCity = world.settlements.find(s => s.id === layout.settlement_id);
    
    if (renderer) {
        renderer.selectedBuilding = null;
        renderer.draw();
    }
    
    const formattedType = dist.type.replace("_", " ").toUpperCase();
    const buildingsInDistrict = layout.buildings.filter(b => b.district_id === dist.id);
    
    let html = `
        <h3 class="inspector-title">${formattedType} DISTRICT</h3>
        <div class="inspector-subtitle" style="--glow-color: #a78bfa">
            ${selectedCity.name}
        </div>
        
        <div class="inspector-stats" style="grid-template-columns: repeat(2, 1fr);">
            <div class="stat-box"><div class="stat-label">Wealth</div><div class="stat-val" style="text-transform: capitalize;">${dist.wealth_level}</div></div>
            <div class="stat-box"><div class="stat-label">Danger</div><div class="stat-val">${Math.round(dist.local_danger_level * 100)}%</div></div>
            <div class="stat-box"><div class="stat-label">Radius</div><div class="stat-val">${dist.radius} cells</div></div>
            <div class="stat-box"><div class="stat-label">Location</div><div class="stat-val">(${dist.x}, ${dist.y})</div></div>
        </div>
        
        <div class="inspector-divider"></div>
        <p class="inspector-description" style="font-weight: 500;">
            Required Services: <span style="color: #94a3b8; font-weight: normal;">${dist.required_services.join(', ')}</span>
        </p>
        <p class="inspector-description" style="font-style: italic; color: var(--gold);">
            Origin Cause: "${dist.origin_reasons.join(', ')}"
        </p>
        
        <div class="inspector-divider"></div>
        <h4 style="color: var(--gold); font-family: var(--font-serif); margin-top: 12px; margin-bottom: 8px;">Buildings in District</h4>
        <div style="display: flex; flex-direction: column; gap: 6px;">
    `;
    
    if (buildingsInDistrict.length > 0) {
        buildingsInDistrict.forEach(bld => {
            html += `
                <div class="building-inspect-item" style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer;" onclick="window.inspectBuildingById('${bld.id}')">
                    <div style="display: flex; justify-content: space-between; font-weight: 500;">
                        <span style="color: var(--gold);">${bld.name}</span>
                        <span style="color: #fbbf24; font-size: 0.8rem;">Tier ${bld.tier}</span>
                    </div>
                    <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 4px;">${bld.purpose}</div>
                </div>
            `;
        });
    } else {
        html += `<div style="font-size: 0.85rem; color: #94a3b8; font-style: italic;">No active buildings placed.</div>`;
    }
    html += `</div>`;
    
    html += `
        <div class="inspector-divider"></div>
        <button class="btn btn-primary" style="margin-top: 8px; width: 100%;" onclick="window.inspectCityById('${selectedCity.id}')">➔ View Settlement Overview</button>
    `;
    
    inspectorContent.innerHTML = html;
    inspectorPanel.classList.add('open');
}

function refreshInspector() {
    if (inspectedType === 'settlement') {
        inspectCity(inspectedData);
    } else if (inspectedType === 'building') {
        inspectBuilding(inspectedData, inspectedLayout);
    } else if (inspectedType === 'district') {
        inspectDistrict(inspectedData, inspectedLayout);
    }
}

window.inspectDistrictById = (distId) => {
    if (!world) return;
    for (const layout of world.settlement_layouts) {
        const dist = layout.districts.find(d => d.id === distId);
        if (dist) {
            inspectDistrict(dist, layout);
            break;
        }
    }
};

window.inspectBuildingById = (bldId) => {
    if (!world) return;
    for (const layout of world.settlement_layouts) {
        const bld = layout.buildings.find(b => b.id === bldId);
        if (bld) {
            inspectBuilding(bld, layout);
            break;
        }
    }
};

window.inspectCityById = (settleId) => {
    if (!world) return;
    const settle = world.settlements.find(s => s.id === settleId);
    if (settle) {
        inspectCity(settle);
    }
};

function closeInspector() {
    selectedCity = null;
    inspectedType = null;
    inspectedData = null;
    inspectedLayout = null;
    if (renderer) {
        renderer.selectedBuilding = null;
        renderer.draw();
    }
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
