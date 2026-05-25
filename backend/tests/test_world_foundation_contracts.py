import json

import numpy as np
import pytest

from app.generators.infrastructure import astar
from app.generators.world_pipeline import generate_full_world_slice


WORLD_CONTRACT_SEEDS = [
    "Eldoria",
    "Valoria",
    "A",
    "B",
    "Seed One",
]


def _assert_in_bounds(node, width, height):
    assert 0 <= node["x"] < width
    assert 0 <= node["y"] < height


def _json_default(value):
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value)
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


@pytest.mark.parametrize("seed", WORLD_CONTRACT_SEEDS)
def test_full_world_generation_is_byte_stable_for_multiple_seeds(seed):
    world_a = generate_full_world_slice(seed)
    world_b = generate_full_world_slice(seed)

    serialized_a = json.dumps(world_a, default=_json_default, sort_keys=True)
    serialized_b = json.dumps(world_b, default=_json_default, sort_keys=True)

    assert serialized_a == serialized_b


@pytest.mark.parametrize("seed", WORLD_CONTRACT_SEEDS)
def test_world_coordinates_and_route_nodes_are_in_bounds_for_multiple_seeds(seed):
    world = generate_full_world_slice(seed)
    width = world["width"]
    height = world["height"]
    cells = world["cells"]

    assert len(cells) == width * height

    for index, cell in enumerate(cells):
        assert cell["x"] == index % width
        assert cell["y"] == index // width

    for collection_name in ("rivers",):
        for path in world[collection_name]:
            assert path
            for node in path:
                _assert_in_bounds(node, width, height)

    for road in world["roads"]:
        assert len(road["path"]) >= 2
        for node in road["path"]:
            _assert_in_bounds(node, width, height)

    for token in world["mobile_tokens"]:
        assert token["route"]
        for node in token["route"]:
            _assert_in_bounds(node, width, height)


def test_astar_returns_adjacent_ocean_free_path_when_route_exists():
    width = height = 7
    elevation = np.full((height, width), 0.5)
    biomes = np.full((height, width), "Lush Plains", dtype=object)
    water_type = np.full((height, width), "none", dtype=object)

    water_type[:, 3] = "ocean"
    water_type[3, 3] = "none"

    path = astar(width, height, (1, 3), (5, 3), elevation, biomes, water_type)

    assert path[0] == {"x": 1, "y": 3}
    assert path[-1] == {"x": 5, "y": 3}
    for node in path:
        assert water_type[node["y"], node["x"]] != "ocean"
    for current, next_node in zip(path, path[1:]):
        assert max(abs(current["x"] - next_node["x"]), abs(current["y"] - next_node["y"])) <= 1
