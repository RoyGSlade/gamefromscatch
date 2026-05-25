from pydantic import BaseModel
from typing import List, Dict
from .cell import CellSchema
from .settlement import SettlementSchema
from .infrastructure import RoadSchema, BridgeSchema, POISchema, MobileTokenSchema
from .resource import ResourceSchema

class WorldResponse(BaseModel):
    seed: str
    width: int
    height: int
    cells: List[CellSchema]
    rivers: List[List[Dict[str, int]]]
    settlements: List[SettlementSchema]
    roads: List[RoadSchema]
    bridges: List[BridgeSchema]
    resources: List[ResourceSchema]
    pois: List[POISchema]
    mobile_tokens: List[MobileTokenSchema]

