from pydantic import BaseModel
from typing import List

class CellSchema(BaseModel):
    x: int
    y: int
    elevation: float
    moisture: float
    temperature: float
    biome: str
    hillshade: float
    water_type: str  # "none", "ocean", "river", "lake"
    river_flow: float
    travel_cost: float
    resources: List[str]
