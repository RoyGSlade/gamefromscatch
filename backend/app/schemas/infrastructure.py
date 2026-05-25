from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from .cell import CoordinateSchema

class RoadSchema(BaseModel):
    id: str = Field(..., description="Unique road ID")
    path: List[CoordinateSchema] = Field(..., description="Ordered list of coordinates representing the road trail")
    origin_reason: str = Field(..., description="Historical reason for the road's existence")

class BridgeSchema(BaseModel):
    id: str = Field(..., description="Unique bridge ID")
    x: int = Field(..., ge=0, le=127)
    y: int = Field(..., ge=0, le=127)
    river_flow: float = Field(..., ge=0.0, description="River flow level at the bridge crossing")
    origin_reason: str = Field(..., description="Reason for bridge engineering here")

class POISchema(BaseModel):
    id: str = Field(..., description="Unique POI ID")
    name: str = Field(..., description="Descriptive POI name")
    x: int = Field(..., ge=0, le=127)
    y: int = Field(..., ge=0, le=127)
    type: Literal["dungeon", "ruin", "cave"] = Field(..., description="Category of POI")
    description: str = Field(..., description="POI description")
    origin_reason: str = Field(..., description="Reason for POI geological/historical placement")

class MobileTokenSchema(BaseModel):
    id: str = Field(..., description="Unique mobile token ID")
    name: str = Field(..., description="Descriptive token name")
    type: Literal["caravan", "patrol"] = Field(..., description="Type of mobile token")
    route: List[CoordinateSchema] = Field(..., description="Route coordinate tracks along path")
    cargo: Optional[str] = Field(None, description="Optional cargo type being transported")
    origin: str = Field(..., description="Origin settlement ID or name")
