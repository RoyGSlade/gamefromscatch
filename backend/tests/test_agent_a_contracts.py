"""
Agent A comprehensive backend contract tests.

Covers: multi-landmass terrain, expanded resource taxonomy, multi-settlement
generation, Delaunay road graph, road hierarchy schema, settlement spacing,
determinism, and schema validation.
"""
import json
from functools import lru_cache

import numpy as np
import pytest

from app.generators.world_pipeline import generate_full_world_slice
from app.schemas.world import WorldResponse


AGENT_A_SEEDS = [
    "Eldoria",
    "Valoria",
    "DeepStone",
    "A",
    "B",
    "Seed One",
    "Mountains",
    "Riverlands",
    "Northreach",
    "Desert-42",
]


@lru_cache(maxsize=None)
def _world(seed):
    return generate_full_world_slice(seed)


# -------------------------------------------------------------------
# 1. Multi-Landmass Terrain
# -------------------------------------------------------------------

def _count_landmasses(world):
    """
    Count distinct connected components of land cells using BFS.
    A landmass is a connected group of cells with elevation >= sea_level (0.45).
    """
    w, h = world["width"], world["height"]
    cell_map = {}
    for c in world["cells"]:
        cell_map[(c["x"], c["y"])] = c

    visited = set()
    landmasses = 0

    for y in range(h):
        for x in range(w):
            cell = cell_map[(x, y)]
            if cell["elevation"] < 0.45 or (x, y) in visited:
                continue

            # BFS flood fill
            landmasses += 1
            queue = [(x, y)]
            visited.add((x, y))
            while queue:
                cx, cy = queue.pop()
                for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited:
                        nc = cell_map[(nx, ny)]
                        if nc["elevation"] >= 0.45:
                            visited.add((nx, ny))
                            queue.append((nx, ny))

    return landmasses


def test_terrain_can_produce_multiple_landmasses():
    """
    At least one seed out of 5 should produce >= 2 distinct landmasses,
    proving the tectonic plate generator creates multi-continent maps.
    """
    multi_count = 0
    for seed in AGENT_A_SEEDS[:5]:
        world = _world(seed)
        lm = _count_landmasses(world)
        if lm >= 2:
            multi_count += 1

    assert multi_count >= 1, "No seed produced multiple landmasses — tectonic plate generator may be broken"


def test_terrain_shoreline_is_organic():
    """
    Verify organic coastline shape (shoreline distance std_dev > 1.5 from center).
    Preserved from original test.
    """
    world = _world("Eldoria")
    w, h = world["width"], world["height"]
    cell_map = {(c["x"], c["y"]): c for c in world["cells"]}

    shoreline_distances = []
    cx, cy = w // 2, h // 2

    for c in world["cells"]:
        if c["elevation"] >= 0.45:
            is_shore = False
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = c["x"] + dx, c["y"] + dy
                if 0 <= nx < w and 0 <= ny < h:
                    neighbor = cell_map.get((nx, ny))
                    if neighbor and neighbor["elevation"] < 0.45:
                        is_shore = True
                        break
            if is_shore:
                dist = np.hypot(c["x"] - cx, c["y"] - cy)
                shoreline_distances.append(dist)

    assert len(shoreline_distances) > 0
    assert np.std(shoreline_distances) > 1.5


# -------------------------------------------------------------------
# 2. Resource Taxonomy
# -------------------------------------------------------------------

ALL_RESOURCE_TYPES = {
    "Iron Ore", "Copper", "Coal",
    "Gold", "Silver",
    "Mithril", "Arcane Crystals",
    "Timber", "Swamp Herbs", "Toxic Mosses", "Oasis Botanicals",
    "Fish",
}

RESOURCE_BIOME_RULES = {
    "Iron Ore": {"Craggy Peaks", "Rolling Hills"},
    "Copper": {"Rolling Hills", "Lush Plains"},
    "Coal": {"Rolling Hills", "Dense Forest"},
    "Gold": {"Craggy Peaks"},
    "Silver": {"Craggy Peaks", "Rolling Hills"},
    "Mithril": {"Frozen Peaks"},
    "Arcane Crystals": {"Craggy Peaks", "Frozen Peaks"},
    "Timber": {"Dense Forest", "Taiga / Boreal"},
    "Swamp Herbs": {"Murky Swamp"},
    "Toxic Mosses": {"Murky Swamp"},
    "Oasis Botanicals": {"Arid Desert"},
    "Fish": set(),  # uses water_type, not biome
}


def test_resource_taxonomy_completeness():
    """
    Across 10 seeds, at least 8 of the 12 resource types should appear.
    Very rare types (Mithril, Toxic Mosses, Oasis Botanicals) may not
    appear in every seed due to terrain constraints.
    """
    seen_types = set()
    for seed in AGENT_A_SEEDS:
        world = _world(seed)
        for r in world["resources"]:
            seen_types.add(r["type"])

    # We expect at least 8 of 12 resource types to appear across 10 seeds
    assert len(seen_types) >= 8, f"Only {len(seen_types)} resource types appeared: {seen_types}"


@pytest.mark.parametrize("seed", AGENT_A_SEEDS[:5])
def test_resource_biome_compliance(seed):
    """
    Every non-Fish resource must be placed in a biome permitted by the taxonomy.
    Fish must be in water cells.
    """
    world = _world(seed)
    cell_map = {(c["x"], c["y"]): c for c in world["cells"]}

    for r in world["resources"]:
        cell = cell_map[(r["x"], r["y"])]
        biome = cell["biome"]
        wt = cell["water_type"]

        if r["type"] == "Fish":
            assert wt in ("ocean", "lake", "river"), f"Fish at ({r['x']},{r['y']}) not in water: {wt}"
        elif r["type"] == "Oasis Botanicals":
            assert biome == "Arid Desert", f"Oasis Botanicals at ({r['x']},{r['y']}) in wrong biome: {biome}"
        else:
            allowed = RESOURCE_BIOME_RULES.get(r["type"])
            if allowed:
                assert biome in allowed, f"{r['type']} at ({r['x']},{r['y']}) in disallowed biome: {biome}"


@pytest.mark.parametrize("seed", AGENT_A_SEEDS[:5])
def test_resource_has_category(seed):
    """Every resource must have a valid category field."""
    world = _world(seed)
    valid_categories = {"industrial_ore", "precious", "arcane", "botanical", "aquatic"}

    for r in world["resources"]:
        assert "category" in r, f"Resource {r['id']} missing category"
        assert r["category"] in valid_categories, f"Resource {r['id']} has invalid category: {r['category']}"


# -------------------------------------------------------------------
# 3. Multi-Settlement Count & Spacing
# -------------------------------------------------------------------

@pytest.mark.parametrize("seed", AGENT_A_SEEDS[:5])
def test_multi_settlement_count(seed):
    """At least 3 settlements, with at least 1 capital and at least 1 outpost-tier."""
    world = _world(seed)
    settlements = world["settlements"]

    assert len(settlements) >= 3, f"Only {len(settlements)} settlements"

    types = {s["type"] for s in settlements}
    assert "capital" in types, f"No capital found, types: {types}"

    outpost_types = {"mining outpost", "logging camp", "fishing village", "outpost"}
    assert types & outpost_types, f"No outpost-tier settlement found, types: {types}"


@pytest.mark.parametrize("seed", AGENT_A_SEEDS[:5])
def test_settlement_minimum_spacing(seed):
    """All settlements must be at least 12 cells apart from each other."""
    world = _world(seed)
    settlements = world["settlements"]

    for i in range(len(settlements)):
        for j in range(i + 1, len(settlements)):
            s1, s2 = settlements[i], settlements[j]
            dist = np.hypot(s1["x"] - s2["x"], s1["y"] - s2["y"])
            assert dist >= 12, (
                f"Settlements {s1['id']} and {s2['id']} too close: {dist:.1f} cells"
            )


# -------------------------------------------------------------------
# 4. Delaunay Road Graph
# -------------------------------------------------------------------

@pytest.mark.parametrize("seed", AGENT_A_SEEDS[:5])
def test_road_count_matches_delaunay(seed):
    """There should be at least (num_settlements - 1) roads from the Delaunay graph."""
    world = _world(seed)
    num_settlements = len(world["settlements"])
    num_roads = len(world["roads"])

    assert num_roads >= num_settlements - 1, (
        f"Expected >= {num_settlements - 1} roads, got {num_roads}"
    )


@pytest.mark.parametrize("seed", AGENT_A_SEEDS[:5])
def test_road_type_and_status_fields(seed):
    """Every road must have valid type and route_status fields."""
    world = _world(seed)
    valid_types = {"highway", "trade_road", "dirt_road"}
    valid_statuses = {"active", "blocked", "requires_ferry", "degraded"}

    for road in world["roads"]:
        assert "type" in road, f"Road {road['id']} missing type"
        assert road["type"] in valid_types, f"Road {road['id']} invalid type: {road['type']}"
        assert "route_status" in road, f"Road {road['id']} missing route_status"
        assert road["route_status"] in valid_statuses, f"Road {road['id']} invalid status: {road['route_status']}"


@pytest.mark.parametrize("seed", AGENT_A_SEEDS[:3])
def test_road_pathfinding_integrity(seed):
    """Roads must be fully connected adjacent-cell sequences."""
    world = _world(seed)
    for road in world["roads"]:
        path = road["path"]
        if not path:
            assert road["route_status"] == "blocked"
            continue
        assert len(path) >= 2
        for i in range(len(path) - 1):
            curr = path[i]
            nxt = path[i + 1]
            dx = abs(curr["x"] - nxt["x"])
            dy = abs(curr["y"] - nxt["y"])
            assert dx <= 1 and dy <= 1, f"Gap in road {road['id']} at step {i}"
            assert not (dx == 0 and dy == 0), f"Duplicate node in road {road['id']} at step {i}"


# -------------------------------------------------------------------
# 5. Mobile Token Schema
# -------------------------------------------------------------------

@pytest.mark.parametrize("seed", AGENT_A_SEEDS[:3])
def test_mobile_token_fields(seed):
    """Tokens must have movement_state and caravans must have cargo_manifest."""
    world = _world(seed)
    valid_states = {"moving", "loading", "unloading", "resting"}

    for token in world["mobile_tokens"]:
        assert "movement_state" in token, f"Token {token['id']} missing movement_state"
        assert token["movement_state"] in valid_states

        if token["type"] == "caravan":
            assert token.get("cargo_manifest") is not None, (
                f"Caravan {token['id']} missing cargo_manifest"
            )
            assert isinstance(token["cargo_manifest"], dict)


# -------------------------------------------------------------------
# 6. Determinism & Schema Validation
# -------------------------------------------------------------------

def _json_default(value):
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value)
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


@pytest.mark.parametrize("seed", AGENT_A_SEEDS)
def test_determinism_across_runs(seed):
    """Same seed must produce byte-identical JSON."""
    world_a = generate_full_world_slice(seed)
    world_b = generate_full_world_slice(seed)

    ser_a = json.dumps(world_a, default=_json_default, sort_keys=True)
    ser_b = json.dumps(world_b, default=_json_default, sort_keys=True)

    assert ser_a == ser_b


@pytest.mark.parametrize("seed", AGENT_A_SEEDS)
def test_schema_validation(seed):
    """WorldResponse Pydantic model must validate cleanly for every seed."""
    world = _world(seed)
    response = WorldResponse.model_validate(world)
    assert response.seed == seed
    assert len(response.cells) == world["width"] * world["height"]
    assert len(response.settlements) >= 3
