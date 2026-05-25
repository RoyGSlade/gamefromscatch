from pydantic import BaseModel, Field
from typing import List

class ProductionChainSchema(BaseModel):
    id: str = Field(..., description="Unique supply chain ID")
    inputs: List[str] = Field(..., description="Raw material inputs")
    processors: List[str] = Field(..., description="Functional processing steps")
    outputs: List[str] = Field(..., description="End products produced")
    buildings_involved: List[str] = Field(..., description="List of involved building IDs")
    settlement_id: str = Field(..., description="Parent settlement ID")
    bottlenecks: List[str] = Field(..., description="Potential flow bottlenecks")
    failure_events: List[str] = Field(..., description="Possible systemic failure incidents")
