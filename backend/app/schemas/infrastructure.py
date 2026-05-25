from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Literal
from .cell import CoordinateSchema

class RoadSchema(BaseModel):
    id: str = Field(..., description="Unique road ID")
    path: List[CoordinateSchema] = Field(..., description="Ordered list of coordinates representing the road trail")
    origin_reason: str = Field(..., description="Historical reason for the road's existence")
    type: Literal["highway", "trade_road", "dirt_road"] = Field(..., description="Road hierarchy classification")
    route_status: Literal["active", "blocked", "requires_ferry", "degraded"] = Field(..., description="Current operational status of the road")

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
    cargo: Optional[str] = Field(None, description="Legacy simple cargo type string (kept for backward compat)")
    cargo_manifest: Optional[Dict[str, int]] = Field(None, description="Weighted cargo payload mapping resource names to quantities")
    movement_state: Literal["moving", "loading", "unloading", "resting"] = Field("moving", description="Current movement phase of the token")
    origin: str = Field(..., description="Origin settlement ID or name")
