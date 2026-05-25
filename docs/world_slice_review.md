# World Slice Foundation Review

Review scope: current backend/frontend architecture, deterministic generation risks, schema weaknesses, and test coverage. Sprint 2 implementation was intentionally not started.

## Architecture Snapshot

The active backend entry point is `backend/app/main.py`. It exposes `GET /api/world/generate`, applies a `WorldResponse` response model, and delegates all generation work to `generate_full_world_slice`.

The active generation pipeline is centralized in `backend/app/generators/world_pipeline.py`:

1. `terrain.generate_terrain` builds elevation, moisture, temperature, hillshade, biomes, and sea level.
2. `hydrology.generate_rivers` derives river paths, water types, and river flow.
3. `resources.generate_resources` overlays resources from biome/water context.
4. `settlements.place_settlements` places one town and one outpost.
5. `infrastructure.generate_infrastructure` creates roads, bridges, POIs, and mobile token routes.
6. The pipeline flattens a 128x128 cell grid into the API response.

The frontend is a Vite/canvas app. `app.js` fetches the generated world, stores it in memory, and passes it to `MapRenderer` in `renderer.js`. Rendering is data-driven from backend JSON for cells, rivers, roads, bridges, settlements, POIs, and mobile token routes.

There is also a legacy-looking `backend/server.py` path with its own schemas, 256 grid constant usage, and older generator modules. It is not launched by `run.ps1`, but it still exposes the same route shape and repeats the same permissive CORS config. This increases drift risk.

Note: the working tree contained uncommitted generator/schema source changes during this review. This report reflects the current files after those changes, but only review docs and isolated tests were added by this review work.

## Findings

### 1. Radial Mask Forces Island Topology

The current file no longer has the original literal `radial_mask`, but the same topology risk remains. `backend/app/generators/terrain.py:32-33` computes an organic coordinate-distance mask and `terrain.py:68` multiplies elevation by it. With `sea_level = 0.45` at `terrain.py:110`, the edge of every generated map is still forced below sea level.

Observed for current review seeds (`Eldoria`, `Valoria`, `A`, `B`, `Seed One`): all 508 border cells were ocean for every seed.

Risk: the generator cannot produce an open continental slice, map-edge continuity, cross-border roads, or rivers entering/leaving the slice. This also hides edge-case hydrology and infrastructure failures because land is heavily biased away from boundaries.

Recommendation for a later sprint: replace the hard radial island mask with a configurable land-shape model, or make the mask seed/biome aware and explicitly test edge land ratios by world type.

### 2. A* Fallback Can Return Invalid Roads

`backend/app/generators/infrastructure.py:61` now documents a second pass that permits ocean traversal with high penalty, and `infrastructure.py:111` implements that relaxed search. If both searches fail, `infrastructure.py:147-148` still returns a two-point direct line from start to end.

Risk: the relaxed pass can intentionally produce roads through ocean cells, and the absolute fallback can still create non-adjacent roads, visually straight-line jumps, and missed river/bridge intersections. The downstream road lowering in `world_pipeline.py` also checks only listed road nodes, so an invalid direct fallback is not represented as a real traversable path.

Recommendation for a later sprint: return an explicit no-path state, retry with constrained bridge/ferry candidates, or emit a typed degraded route status. Do not silently create a direct road.

### 3. CORS Is Too Loose

Both `backend/app/main.py:15-19` and `backend/server.py:17-21` configure:

```python
allow_origins=["*"]
allow_credentials=True
allow_methods=["*"]
allow_headers=["*"]
```

Risk: this is broader than needed for a local Vite frontend. It also combines wildcard origins with credentials, which is a bad default if auth or cookies are added later.

Recommendation: centralize CORS settings in config and allow only known dev/prod origins.

### 4. Frontend Backend URL Is Hardcoded

`app.js:69` fetches `http://127.0.0.1:8000/api/world/generate` directly.

Risk: this breaks non-local deployments, alternate ports, HTTPS hosting, reverse proxies, and hosted frontend builds. It also makes frontend tests or preview environments harder to configure.

Recommendation: use a Vite env var or relative `/api/...` URL with a dev proxy.

### 5. Seed Determinism Is Mostly Sound But Not Fully Guarded

Positive: `backend/app/generators/noise.py:9` uses SHA-256 seed derivation instead of Python `hash()`, and generation uses `np.random.default_rng`, which is stable within the current NumPy algorithm/runtime assumptions.

Risks:

- Full-output determinism was only lightly covered before this review.
- Some response values can leak NumPy scalar types from generator choices, which are not plain JSON serializable before FastAPI/Pydantic coercion.
- Determinism may still shift across NumPy versions if random algorithms or floating behavior change.
- Tied candidate scores are sorted deterministically by scan order, but that can create map-position bias.

Recommendation: keep deterministic contract tests, add pinned golden summaries per supported runtime, and coerce all public response values to plain Python primitives before returning.

### 6. Schema Contracts Are Improved But Still Incomplete

The current working tree has started tightening schemas with `Field` bounds, `Literal` values, `CoordinateSchema`, and `ResourceSchema`. This is a useful direction, but there are still gaps:

- `WorldResponse.rivers` still uses `List[List[Dict[str, int]]]` instead of `CoordinateSchema`.
- `SettlementSchema.resources` is still `List[str]`, so settlement goods are not constrained to known resource/trade-good values.
- `biome`, `POISchema.type`, IDs, names, rulers, lore, and origin reasons are unconstrained strings.
- `river_flow` and `travel_cost` are unbounded floats.
- Coordinate bounds are hardcoded to 0-127 in schemas, so schema changes are required if world size changes.
- There is no schema-level validation for `len(cells) == width * height`, unique IDs, route adjacency, bridge-road intersections, or cross-object references such as token origins.

Risk: frontend assumptions can silently break while the response still validates.

Recommendation: finish typed coordinate/resource coverage, move bounds to shared config, add finite/range constraints for remaining numeric fields, and add model validators for world-level invariants.

## Test Coverage

Existing tests were concentrated in `backend/tests/test_world_generation.py` and mostly exercised `Eldoria`. That left multi-seed regressions undercovered.

Added during this review:

- `backend/tests/conftest.py` so `python -m pytest backend\tests` works from the repository root.
- `backend/tests/test_world_foundation_contracts.py` with multi-seed full-output stability checks.
- Multi-seed coordinate and route-node bounds checks.
- A direct unit test showing A* can produce an adjacent ocean-free route when a valid gap exists.

Still missing:

- A failing/xfail desired-behavior test for disconnected A* routes. This should wait until the fallback contract is chosen.
- Tests that assert radial-mask land/edge ratios for intended world types.
- API-level response validation tests through FastAPI `TestClient`.
- CORS config tests.
- Frontend API base URL configuration tests.
- Performance tests for no-path or large-search A* cases.
- Golden summary snapshots across multiple seeds and supported Python/NumPy versions.

## Verification

Ran:

```powershell
python -m pytest backend\tests -q
```

Result:

```text
18 passed
```

No changes were made to `terrain.py`, `hydrology.py`, or frontend visuals.
