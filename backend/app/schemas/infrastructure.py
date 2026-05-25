from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from .cell import CoordinateSchema

class RoadSchema(BaseModel):
    id: str
    path: List[CoordinateSchema]
    origin_reason: str

class BridgeSchema(BaseModel):
    id: str
    x: int = Field(..., ge=0, le=127)
    y: int = Field(..., ge=0, le=127)
    river_flow: float
    origin_reason: str

class POISchema(BaseModel):
    id: str
    name: str
    x: int = Field(..., ge=0, le=127)
    y: int = Field(..., ge=0, le=127)
    type: str  # e.g., "dungeon", "ruin", "cave"
    description: str
    origin_reason: str

class MobileTokenSchema(BaseModel):
    id: str
    name: str
    type: Literal["caravan", "patrol"]
    route: List[CoordinateSchema]
    cargo: Optional[str] = None
    origin: str  # origin settlement ID or name

