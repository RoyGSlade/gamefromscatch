from pydantic import BaseModel
from typing import List, Dict, Optional, Any

class RoadSchema(BaseModel):
    id: str
    path: List[Dict[str, int]]  # List of {"x": int, "y": int}
    origin_reason: str

class BridgeSchema(BaseModel):
    id: str
    x: int
    y: int
    river_flow: float
    origin_reason: str

class POISchema(BaseModel):
    id: str
    name: str
    x: int
    y: int
    type: str  # e.g., "dungeon", "ruin", "cave"
    description: str
    origin_reason: str

class MobileTokenSchema(BaseModel):
    id: str
    name: str
    type: str  # "caravan" or "patrol"
    route: List[Dict[str, int]]  # Coordinates along path
    cargo: Optional[str] = None
    origin: str  # origin settlement ID or name
