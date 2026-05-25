from pydantic import BaseModel, Field
from typing import List, Literal

class CoordinateSchema(BaseModel):
    x: int = Field(..., ge=0, le=127)
    y: int = Field(..., ge=0, le=127)

class CellSchema(BaseModel):
    x: int = Field(..., ge=0, le=127)
    y: int = Field(..., ge=0, le=127)
    elevation: float = Field(..., ge=0.0, le=1.0)
    moisture: float = Field(..., ge=0.0, le=1.0)
    temperature: float = Field(..., ge=0.0, le=1.0)
    biome: str
    hillshade: float = Field(..., ge=0.0, le=1.0)
    water_type: Literal["none", "ocean", "river", "lake"]
    river_flow: float
    travel_cost: float
    resources: List[Literal["Iron Ore", "Gold", "Timber", "Fish"]]

