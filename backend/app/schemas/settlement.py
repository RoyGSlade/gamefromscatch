from pydantic import BaseModel
from typing import List

class SettlementSchema(BaseModel):
    id: str
    name: str
    x: int
    y: int
    type: str  # "town" or "outpost"
    origin_reason: str  # Non-negotiable: why this settlement exists
    population: int
    resources: List[str]
    ruler: str
    lore: str
