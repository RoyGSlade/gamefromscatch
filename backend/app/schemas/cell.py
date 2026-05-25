from pydantic import BaseModel, Field
from typing import List, Literal
from .resource import RESOURCE_TYPES

class CoordinateSchema(BaseModel):
    x: int = Field(..., ge=0, le=127, description="X coordinate (0-127)")
    y: int = Field(..., ge=0, le=127, description="Y coordinate (0-127)")

class CellSchema(BaseModel):
    x: int = Field(..., ge=0, le=127)
    y: int = Field(..., ge=0, le=127)
    elevation: float = Field(..., ge=0.0, le=1.0)
    moisture: float = Field(..., ge=0.0, le=1.0)
    temperature: float = Field(..., ge=0.0, le=1.0)
    biome: str = Field(..., description="Biome name")
    hillshade: float = Field(..., ge=0.0, le=1.0)
    water_type: Literal["none", "ocean", "river", "lake"] = Field(..., description="Type of water present in this cell")
    river_flow: float = Field(..., ge=0.0)
    travel_cost: float = Field(..., ge=0.0)
    resources: List[RESOURCE_TYPES] = Field(..., description="List of resource types overlaying this cell")
