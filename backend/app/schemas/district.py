from pydantic import BaseModel, Field
from typing import List, Literal

class DistrictSchema(BaseModel):
    id: str = Field(..., description="Unique district ID")
    settlement_id: str = Field(..., description="Parent settlement ID")
    type: str = Field(..., description="District category, e.g., town_center, market, worker_camp")
    x: int = Field(..., ge=0, le=127, description="Absolute global X coordinate of district center")
    y: int = Field(..., ge=0, le=127, description="Absolute global Y coordinate of district center")
    radius: int = Field(..., ge=1, description="Radius in cells of the district")
    origin_reasons: List[str] = Field(..., description="Backstory reasons explaining the district's presence")
    required_services: List[str] = Field(..., description="Urban services required for this district")
    local_danger_level: float = Field(..., ge=0.0, le=1.0, description="Localized hazard rating")
    wealth_level: Literal["poor", "common", "wealthy"] = Field(..., description="General wealth tier")
