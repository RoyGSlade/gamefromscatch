# Sprint 3 Codex Review: Town Slice Foundation

## Summary

Sprint 3 is mostly on the right architectural path: town slice data is generated in Python and returned through `settlement_layouts` in the world JSON. The active frontend renders and inspects that backend JSON instead of generating authoritative districts/buildings.

Correctness patches were applied for local road generation, public tavern/inn metadata, inspector tolerance for missing optional arrays, and the missing Vite build script. The map was also checked in Chrome at `http://localhost:3000/`; it rendered from the live backend response.

## Files Reviewed

- `backend/app/main.py`
- `backend/app/generators/world_pipeline.py`
- `backend/app/generators/settlement_layout.py`
- `backend/app/generators/buildings.py`
- `backend/app/generators/production_chains.py`
- `backend/app/generators/job_slots.py`
- `backend/app/generators/settlements.py`
- `backend/app/generators/resources.py`
- `backend/app/schemas/world.py`
- `backend/app/schemas/settlement_layout.py`
- `backend/app/schemas/district.py`
- `backend/app/schemas/building.py`
- `backend/app/schemas/production.py`
- `backend/tests/test_settlement_layout.py`
- `backend/tests/test_building_causality.py`
- `backend/tests/test_sprint3_town_slice_contracts.py`
- `app.js`
- `renderer.js`
- `world.js`
- `cityGen.js`
- `vite.config.js`
- `package.json`

## Tests Run

```powershell
python -m pytest backend\tests -q
```

Result: `66 passed`

```powershell
npm run build
```

Result: Vite production build completed successfully.

FastAPI endpoint check:

```text
GET http://127.0.0.1:8000/api/world/generate?seed=Eldoria
STATUS=200
CELLS=16384
LAYOUTS=2
```

Chrome render check:

- Loaded `http://localhost:3000/`.
- Backend JSON loaded successfully.
- Canvas map rendered terrain, settlement layout roads, districts, and buildings.

## Bugs Found

1. Local settlement roads were never generated.
   - Cause: local road A* ran after building placement and rejected occupied destination cells such as town centers, district centers, and public building anchors.
   - Impact: `local_roads` was empty across sampled seeds, so public buildings were not connected to roads.

2. `tavern/inn` was not treated as public-access or night-open.
   - Cause: `create_building_template` checked only `"tavern"` and `"inn"`, while the actual town proposal uses `"tavern/inn"`.
   - Impact: tavern/inn buildings failed public-building access expectations.

3. Frontend inspector assumed optional arrays always existed.
   - Cause: inspector rendering called `.join`, `.length`, and `.filter` directly on backend arrays.
   - Impact: partial or future-compatible backend JSON could break inspection even when rendering could continue.

4. `npm run build` was missing.
   - Cause: `package.json` had `dev` and `start` but no `build`.
   - Impact: the required integration validation command failed before Vite could compile.

## Bugs Fixed

1. Added deterministic local access-cell routing in `settlement_layout.py`.
   - Roads now route to nearest unoccupied access cells for settlement centers, district centers, and public building perimeters.
   - Public buildings are checked for adjacent local road access.

2. Marked `"tavern/inn"` as public access and not locked at night in `buildings.py`.

3. Hardened `app.js` inspector rendering with safe list formatting and default values for missing optional fields.

4. Added `build: vite build` to `package.json`.

5. Added `backend/tests/test_sprint3_town_slice_contracts.py`.
   - Generates 10 fixed seeds twice and compares layout/road outputs exactly.
   - Validates Pydantic world schema.
   - Validates district/building/job/production-chain references.
   - Validates local road coordinates and adjacency.
   - Validates no building overlaps and no local roads crossing building footprints.
   - Validates public building road access.
   - Validates sawmill, dock, mining, tavern/inn, warehouse/storage, stable, and shrine/temple causality rules when those building types appear.
   - Confirms active frontend files do not import legacy authoritative world/city generators.

## Remaining Blockers

- Legacy `world.js` and `cityGen.js` still contain client-side generation code. They are not imported by the active app path, but their presence is a long-term source-of-truth risk.
- `aiBridge.js` still uses `Math.random()` for mock interaction rolls. This is outside the town-slice authoritative generation path, but it should not be treated as deterministic simulation state.
- Legacy `backend/generators/*` modules use global NumPy random APIs. They are not part of the active `backend/app/generators` path, but they should be removed or quarantined to avoid accidental reuse.
- The current schema validates object shapes but does not yet enforce all cross-object invariants at the Pydantic model level; the new pytest coverage catches those invariants instead.
- Existing tracked `__pycache__` files are dirty in the worktree and should be cleaned from version control separately.

## Recommendation

Pass with warnings.

The Sprint 3 town slice foundation is now correctness-hardened enough to proceed, provided Sprint 4 does not reintroduce frontend authority over buildings/districts or mutate backend-authored layout state in debug/render paths.
