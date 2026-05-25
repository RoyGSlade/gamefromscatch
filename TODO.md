# Chronicles of Eldoria TODO Status Audit

Last audited: 2026-05-25

This checklist tracks the full 14-day RPG engine expansion manual against the current repository state. It is a status document only; it does not change runtime behavior or public APIs.

## Current Architecture Snapshot

- Active backend: FastAPI app at `backend/app/main.py` with `GET /api/world/generate`.
- Active generation path: `backend/app/generators/world_pipeline.py` orchestrates terrain, hydrology, resources, settlements, infrastructure, and settlement layouts.
- Active frontend: root Vite/canvas files (`app.js`, `renderer.js`, `viewport.js`, `labelEngine.js`, `index.html`, `index.css`), not a `frontend/src/` tree.
- Active API response shape: `cells`, `rivers`, `settlements`, `roads`, `bridges`, `resources`, `pois`, `mobile_tokens`, and `settlement_layouts`.
- Current sample shape for seed `Eldoria`: 16,384 cells, 2 settlements, 3 rivers, 33 resources, 1 road, 1 dungeon POI, 2 mobile tokens, and 2 settlement layouts.
- Maintenance note: the worktree already contains dirty changes and deleted generated artifacts. Clean tracked caches, `dist/`, and `node_modules/` separately; do not mix that cleanup with feature work.

## Two-Agent Concurrent Work Plan

Use two agents only after the current dirty baseline is intentionally resolved. Do not run two agents in the same working directory.

### Baseline Setup

- [ ] Commit or stash intentional current changes before starting parallel work.
- [ ] Clean tracked generated artifacts (`node_modules/`, `dist/`, `__pycache__/`) in a dedicated cleanup commit.
- [ ] Keep the shared base branch on `feature/rpg-engine-expansion`.
- [ ] Create a separate worktree and branch for backend work: `agent/backend-worldgen`.
- [ ] Create a separate worktree and branch for frontend work: `agent/frontend-simulation`.
- [ ] Confirm both worktrees start from the same baseline commit.

### File Ownership Locks

- [ ] Agent A owns backend generation, backend schemas, and backend tests.
- [ ] Agent A may edit `backend/app/generators/*`, `backend/app/schemas/*`, and `backend/tests/*`.
- [ ] Agent B owns frontend simulation, rendering, perception, AI bridge, and browser verification.
- [ ] Agent B may edit `app.js`, `renderer.js`, `viewport.js`, `labelEngine.js`, `index.html`, `index.css`, and restored/replaced `simulation.js`, `player.js`, `aiBridge.js` if needed.
- [ ] Only Agent A changes API response schema fields.
- [ ] Only Agent B changes rendering and UI behavior.
- [ ] `TODO.md`, `package.json`, `vite.config.js`, and `run.ps1` remain coordinator-owned unless explicitly assigned.

### Agent A: Backend / Procedural Map Generation

- [ ] Replace region falloff with true multi-landmass terrain generation.
- [ ] Expand resource taxonomy and placement rules.
- [ ] Add multi-settlement generation beyond one town and one outpost.
- [ ] Add Delaunay or equivalent proximity graphing.
- [ ] Add global road hierarchy and route metadata.
- [ ] Add public schema fields for road `type`, public `route_status`, weighted token cargo, and token movement state.
- [ ] Expand backend tests for deterministic generation, schema validation, route integrity, resource placement, and settlement count.

### Agent B: Frontend / Simulation / UX

- [ ] Restore or replace active turn-clock, player pathing, and AI bridge modules.
- [ ] Wire `advanceTurn(actionType, cost)` into player movement and token updates.
- [ ] Replace frame-based mobile-token progression with turn-based token state.
- [ ] Implement continuous alpha zoom blending in `renderer.js`.
- [ ] Add passive perception label filtering for building names.
- [ ] Update AI payload generation to use richer building and world-state fields.
- [ ] Run `npm run build` and browser smoke checks after frontend work.

### Integration Order

- [ ] Merge Agent A first because Agent B consumes backend contract changes.
- [ ] After Agent A merge, run `python -m pytest backend\tests -q`.
- [ ] After Agent A merge, smoke check `/api/world/generate?seed=Eldoria`.
- [ ] Rebase Agent B on the merged Agent A branch.
- [ ] Resolve frontend usage against the final backend schema.
- [ ] Run `npm run build`.
- [ ] Run the full backend test suite.
- [ ] Run a browser smoke test through Vite and FastAPI.

## Completed

- [x] FastAPI endpoint exists at `/api/world/generate`.
- [x] CORS is configured for local browser access.
- [x] Vite dev proxy routes `/api` to the FastAPI backend.
- [x] Pydantic response models cover the main world, cell, resource, infrastructure, settlement, and layout objects.
- [x] Deterministic 128x128 terrain generation exists.
- [x] Biomes, elevation, moisture, temperature, and hillshade are generated server-side.
- [x] Rivers, lakes, and `river_flow` are generated server-side.
- [x] Backend-authored resource overlays exist.
- [x] Resource placement currently supports Iron Ore, Gold, Timber, and Fish.
- [x] Backend places one town and one resource outpost.
- [x] A* road routing connects the town and outpost.
- [x] Bridge detection exists for road and river intersections.
- [x] Dungeon POI generation exists.
- [x] Caravan and patrol route data is emitted in `mobile_tokens`.
- [x] Settlement layouts use absolute global grid coordinates.
- [x] Districts, buildings, local roads, job slots, and production chains are generated server-side.
- [x] Building placement prevents footprint overlap through occupied-cell checks.
- [x] Public buildings are connected to local roads in the tested layout path.
- [x] Renderer consumes backend JSON as the source of truth.
- [x] Renderer draws terrain relief using backend `hillshade`.
- [x] Renderer draws river thickness from backend `river_flow`.
- [x] Renderer draws roads, bridges, settlements, POIs, settlement details, labels, and mobile tokens.
- [x] Backend tests cover determinism, route bounds, schemas, settlement geometry, causality, and cartography helper behavior.

## Partial / Needs Finish

- [ ] Terrain still uses an organic region falloff; it is not a true multi-continent tectonic plate generator.
- [ ] The old frontend `world.js` radial-mask generator is deleted from the working tree and not active, but the backend still has a center-biased region falloff to replace.
- [ ] Resource taxonomy is limited to Iron Ore, Gold, Timber, and Fish; copper, coal, silver, mithril, arcane crystals, swamp herbs, toxic mosses, and oasis botanicals are not implemented.
- [ ] Infrastructure is one town-to-outpost route, not Delaunay graphing across multiple capitals, towns, outposts, and resource sites.
- [ ] Road hierarchy metadata is not publicly exposed; future schema work should add road `type` and public `route_status`.
- [ ] Roads do not yet distinguish main highways from dirt roads in the global API contract.
- [ ] Mobile tokens are frame-animated in the renderer; they are not advanced by a turn-based simulation state.
- [ ] Token cargo is a single optional string; future schema work should add weighted cargo payloads such as `{ "ore": 50 }`.
- [ ] Building schema has tier, price, obscurity, locks, jobs, and production data, but not the full Day 10 archetype fields such as resident caps, employee caps, inventory tier caps, storage volume, and current occupants.
- [ ] Building rotation is deterministic but not calculated from perpendicular street adjacency vectors.
- [ ] Local street counts scale through current generator behavior and tests, but the explicit `population / 1200` minimum is not enforced as a named contract.
- [ ] LOD behavior still relies on zoom thresholds; continuous alpha blending for macro and micro layers is not complete.
- [ ] Turn clock, player pathing, perception/FOW, and AI bridge code are not active in the current app path.
- [ ] `aiBridge.js`, `simulation.js`, `player.js`, `world.js`, and `cityGen.js` are currently deleted from the working tree; decide whether to restore, replace, or permanently retire them before Sprint 4 work.

## Open Backlog

### Sprint 1: Core Architecture

- [ ] Replace the backend region falloff with a true multi-landmass tectonic generator.
- [ ] Finalize API contract naming around `cells` versus the manual's `grid`.
- [ ] Add event-driven simulation state with `advanceTurn(actionType, cost)`.
- [ ] Define a shared turn cost matrix for roads, biomes, water, and impassable terrain.
- [ ] Remove all active frame-delta time progression from gameplay state; keep visual animation separate from simulation time.

### Sprint 2: Infrastructure and Resources

- [ ] Add Delaunay or equivalent proximity graphing after multi-settlement generation.
- [ ] Expand settlement placement beyond one town and one outpost.
- [ ] Route roads across graph edges with global A* and least-resistance terrain costs.
- [ ] Add global road hierarchy: `highway`, `dirt_road`, and any degraded route statuses needed for blocked/ferry paths.
- [ ] Expand resource matrices for industrial ore, precious nodes, arcane nodes, botanical resources, and oasis constraints.
- [ ] Spawn multiple Tier 1 outposts from resource density: logging camps, mining hamlets, and farming communes.
- [ ] Promote internal route metadata into Pydantic schemas instead of relying on unmodeled extra fields.

### Sprint 3: Settlement Layouts

- [ ] Export a reusable AABB helper if frontend or tests need the exact public `checkAABBIntersection` function.
- [ ] Add an explicit street-density contract: minimum street segment count equals `settlement.population / 1200`.
- [ ] Calculate building frontage and rotation from the nearest road segment's perpendicular normal.
- [ ] Expand harbor causality to force Docks, Trade Warehouse, and Shipwright when `isCoastal` is true.
- [ ] Expand river causality to force high-flow riverbank Waterwheel or Sawmill placement when `hasRiver` is true.
- [ ] Extend building archetypes with `max_residents`, `max_employees`, `current_occupants`, `inventory_tier_cap`, and `storage_volume_limit`.

### Sprint 4: Tokens, Visibility, and AI

- [ ] Move caravans and patrols through turn-based token state instead of renderer frame counters.
- [ ] Add dungeon taxonomy by biome: swamp crypts, mountain warrens/lairs, and forest bandit camps.
- [ ] Add hostile population or threat state for dangerous POIs.
- [ ] Replace binary zoom checks with continuous alpha interpolation from `viewport.camera.zoom`.
- [ ] Fade macro layers out and micro settlement/building layers in without visual popping.
- [ ] Add player passive perception state.
- [ ] Filter building labels through `obscurity_rating`, showing `Unknown Building` until perception succeeds.
- [ ] Rebuild AI bridge payload generation around current turn, phase, target building, capacities, price modifiers, locks, and environment context.

### Ops and Verification

- [ ] Keep feature work on `feature/rpg-engine-expansion`; do not write directly to `main` or `master`.
- [ ] Keep commits scoped to a single objective and use semantic prefixes such as `feat(core):`, `refactor(render):`, or `fix(geo):`.
- [ ] Remove tracked generated artifacts and caches from version control in a dedicated cleanup commit.
- [ ] Before merge or PR finalization, run backend tests.
- [ ] Before merge or PR finalization, run `npm run build`.
- [ ] Before merge or PR finalization, start FastAPI and confirm `/api/world/generate?seed=Eldoria` returns a clean response.
- [ ] Before merge or PR finalization, launch the Vite client and verify map rendering from the live backend response.

## Public Interface Watchlist

- [ ] Add road `type` and public `route_status` when road hierarchy work begins.
- [ ] Add weighted token cargo payloads and token movement state before turn-based mobile tokens are implemented.
- [ ] Add richer building archetype fields before AI payload integration depends on them.
- [ ] Add event-driven simulation state before player movement and world-token advancement depend on turn costs.
- [ ] Add perception visibility fields only after the frontend label and inspector behavior is specified.

## Verification Commands

Documentation-only verification:

```powershell
git diff -- TODO.md
```

Optional status refresh:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
python -m pytest backend\tests -q
npm run build
```

Endpoint smoke check after starting the backend:

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/api/world/generate?seed=Eldoria"
```
