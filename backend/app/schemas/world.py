from pydantic import BaseModel
from typing import List, Dict, Any
from .cell import CellSchema
from .settlement import SettlementSchema
from .infrastructure import RoadSchema, BridgeSchema, POISchema, MobileTokenSchema

class WorldResponse(BaseModel):
    seed: str
    width: int
    height: int
    cells: List[CellSchema]
    rivers: List[List[Dict[str, int]]]
    settlements: List[SettlementSchema]
    roads: List[RoadSchema]
    bridges: List[BridgeSchema]
    resources: List[Dict[str, Any]]
    pois: List[POISchema]
    mobile_tokens: List[MobileTokenSchema]
