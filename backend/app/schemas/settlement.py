from pydantic import BaseModel, Field
from typing import List, Literal

class SettlementSchema(BaseModel):
    id: str
    name: str
    x: int = Field(..., ge=0, le=127)
    y: int = Field(..., ge=0, le=127)
    type: Literal["town", "mining outpost", "logging camp", "outpost"]
    origin_reason: str  # Non-negotiable: why this settlement exists
    population: int = Field(..., gt=0)
    resources: List[str]
    ruler: str
    lore: str

