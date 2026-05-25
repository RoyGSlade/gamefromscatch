from pydantic import BaseModel
from typing import List
from .cell import CellSchema, CoordinateSchema
from .settlement import SettlementSchema
from .infrastructure import RoadSchema, BridgeSchema, POISchema, MobileTokenSchema
from .resource import ResourceSchema
from .settlement_layout import SettlementLayoutSchema

class WorldResponse(BaseModel):
    seed: str
    width: int
    height: int
    cells: List[CellSchema]
    rivers: List[List[CoordinateSchema]]
    settlements: List[SettlementSchema]
    roads: List[RoadSchema]
    bridges: List[BridgeSchema]
    resources: List[ResourceSchema]
    pois: List[POISchema]
    mobile_tokens: List[MobileTokenSchema]
    settlement_layouts: List[SettlementLayoutSchema]
