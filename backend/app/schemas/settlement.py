from pydantic import BaseModel, Field
from typing import List, Literal

class SettlementSchema(BaseModel):
    id: str = Field(..., description="Unique settlement ID")
    name: str = Field(..., description="Deterministically generated name")
    x: int = Field(..., ge=0, le=127, description="X coordinate of settlement")
    y: int = Field(..., ge=0, le=127, description="Y coordinate of settlement")
    type: Literal["town", "mining outpost", "logging camp", "outpost"] = Field(..., description="Type of settlement")
    origin_reason: str = Field(..., description="Critical non-negotiable backstory explaining the settlement's geographic location")
    population: int = Field(..., ge=0, description="Settlement population count")
    resources: List[str] = Field(..., description="List of trade goods produced or traded")
    ruler: str = Field(..., description="Ruler name and title")
    lore: str = Field(..., description="Flavor lore description")
