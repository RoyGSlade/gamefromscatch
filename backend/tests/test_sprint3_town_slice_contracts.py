import json
from functools import lru_cache
from pathlib import Path

import numpy as np
import pytest

from app.generators.world_pipeline import generate_full_world_slice
from app.schemas.world import WorldResponse


SPRINT3_SEEDS = [
    "Eldoria",
    "Valoria",
    "A",
    "B",
    "C",
    "Seed One",
    "Mountains",
    "Riverlands",
    "Northreach",
    "Desert-42",
]


@lru_cache(maxsize=None)
def generated_world(seed):
    return generate_full_world_slice(seed)


def assert_json_equal(left, right):
    assert json.dumps(left, sort_keys=True) == json.dumps(right, sort_keys=True)


def footprint_cells(building):
    for y in range(building["y"], building["y"] + building["height"]):
        for x in range(building["x"], building["x"] + building["width"]):
            yield x, y


def touches_road(building, road_coords):
    for x, y in footprint_cells(building):
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if (nx, ny) in road_coords:
                return True
    return False


def touches_water(building, water_map, allowed_types):
    for x, y in footprint_cells(building):
        if water_map.get((x, y)) in allowed_types:
            return True
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if water_map.get((nx, ny)) in allowed_types:
                return True
    return False


def test_town_slice_outputs_are_deterministic_for_ten_fixed_seeds():
    for seed in SPRINT3_SEEDS:
        world_a = generate_full_world_slice(seed)
        world_b = generate_full_world_slice(seed)

        for key in ("settlement_layouts", "roads"):
            assert_json_equal(world_a[key], world_b[key])


@pytest.mark.parametrize("seed", SPRINT3_SEEDS)
def test_town_slice_schema_and_references_are_valid(seed):
    world = generated_world(seed)
    WorldResponse.model_validate(world)

    for layout in world["settlement_layouts"]:
        settlement_ids = {settlement["id"] for settlement in world["settlements"]}
        assert layout["settlement_id"] in settlement_ids

        district_ids = {district["id"] for district in layout["districts"]}
        building_ids = {building["id"] for building in layout["buildings"]}
        job_ids = {job["id"] for job in layout["job_slots"]}

        assert district_ids
        assert building_ids

        for district in layout["districts"]:
            assert district["settlement_id"] == layout["settlement_id"]
            assert district["origin_reasons"]
            assert 0 <= district["x"] < world["width"]
            assert 0 <= district["y"] < world["height"]
            assert district["radius"] > 0

        for building in layout["buildings"]:
            assert building["settlement_id"] == layout["settlement_id"]
            assert building["district_id"] in district_ids
            assert building["origin_reasons"]
            assert building["purpose"]
            assert 1 <= building["tier"] <= 5
            assert 0.0 <= building["condition"] <= 1.0
            assert 0 <= building["x"] < world["width"]
            assert 0 <= building["y"] < world["height"]
            assert building["x"] + building["width"] <= world["width"]
            assert building["y"] + building["height"] <= world["height"]
            for job_id in building["job_slots"]:
                assert job_id in job_ids

        for chain in layout["production_chains"]:
            assert chain["settlement_id"] == layout["settlement_id"]
            assert chain["buildings_involved"]
            for building_id in chain["buildings_involved"]:
                assert building_id in building_ids

        for job in layout["job_slots"]:
            assert job["settlement_id"] == layout["settlement_id"]
            assert job["building_id"] in building_ids
            assert job["count"] >= 1

        for road in layout["local_roads"]:
            assert road["path"]
            for node in road["path"]:
                assert 0 <= node["x"] < world["width"]
                assert 0 <= node["y"] < world["height"]
            for current, next_node in zip(road["path"], road["path"][1:]):
                step = abs(current["x"] - next_node["x"]) + abs(current["y"] - next_node["y"])
                assert step == 1


@pytest.mark.parametrize("seed", SPRINT3_SEEDS)
def test_town_slice_geometry_and_public_access_are_valid(seed):
    world = generated_world(seed)

    for layout in world["settlement_layouts"]:
        occupancy = np.zeros((world["height"], world["width"]), dtype=bool)
        road_coords = {
            (node["x"], node["y"])
            for road in layout["local_roads"]
            for node in road["path"]
        }

        assert layout["local_roads"], f"{layout['settlement_id']} has no local roads"

        for building in layout["buildings"]:
            cells = list(footprint_cells(building))
            assert cells
            for x, y in cells:
                assert not occupancy[y, x], f"{building['id']} overlaps another building"
                assert (x, y) not in road_coords, f"{building['id']} overlaps a local road"
            for x, y in cells:
                occupancy[y, x] = True

        for building in layout["buildings"]:
            if building["public_access"]:
                assert touches_road(building, road_coords), f"{building['id']} lacks road access"


@pytest.mark.parametrize("seed", SPRINT3_SEEDS)
def test_town_slice_causality_rules(seed):
    world = generated_world(seed)
    water_map = {(cell["x"], cell["y"]): cell["water_type"] for cell in world["cells"]}

    for layout in world["settlement_layouts"]:
        settlement = next(s for s in world["settlements"] if s["id"] == layout["settlement_id"])
        road_coords = {
            (node["x"], node["y"])
            for road in layout["local_roads"]
            for node in road["path"]
        }

        for building in layout["buildings"]:
            building_type = building["type"]

            if building_type == "sawmill":
                assert "Timber" in settlement["resources"]
                assert touches_water(building, water_map, {"river"})
                assert touches_road(building, road_coords)

            if building_type in {"docks", "dockyard"}:
                assert touches_water(building, water_map, {"ocean", "lake"})

            if building_type in {"mine_entrance", "mining_office"}:
                mineable = {"Iron Ore", "Gold", "Copper", "Coal", "Silver", "Mithril", "Arcane Crystals"}
                assert any(resource in mineable for resource in settlement["resources"])

            if building_type in {"tavern", "inn", "tavern/inn"}:
                assert settlement["population"] > 0 or layout["local_roads"]
                assert building["public_access"]

            if building_type in {"granary", "storehouse", "warehouse", "storage_shed"}:
                assert building["requires"] or building["produces"] or settlement["resources"]

            if building_type in {"stable", "stables"}:
                assert layout["local_roads"]

            if building_type in {"shrine", "temple"}:
                assert settlement["population"] > 0


def test_active_frontend_does_not_import_legacy_authoritative_generators():
    root_path = Path(__file__).parents[2]
    app_js_path = root_path / "app.js"
    if not app_js_path.exists():
        app_js_path = Path("app.js")
        
    renderer_js_path = root_path / "renderer.js"
    if not renderer_js_path.exists():
        renderer_js_path = Path("renderer.js")

    app_js = app_js_path.read_text(encoding="utf-8")
    renderer_js = renderer_js_path.read_text(encoding="utf-8")

    active_bundle = app_js + "\n" + renderer_js
    assert "from './world.js'" not in active_bundle
    assert "from './cityGen.js'" not in active_bundle
    assert "new WorldMap" not in active_bundle
    assert "new CityGenerator" not in active_bundle
