from pydantic import BaseModel, Field
from typing import List, Literal
from .cell import CoordinateSchema
from .district import DistrictSchema
from .building import BuildingSchema
from .production import ProductionChainSchema

class JobSlotSchema(BaseModel):
    id: str = Field(..., description="Unique job slot ID")
    settlement_id: str = Field(..., description="Parent settlement ID")
    building_id: str = Field(..., description="Parent building ID")
    role: str = Field(..., description="Work role title")
    count: int = Field(..., ge=1, description="Number of positions open")
    required_skills: List[str] = Field(..., description="Skills required for the role")
    social_importance: int = Field(..., ge=1, le=5, description="Social hierarchy rating (1-5)")
    danger_level: float = Field(..., ge=0.0, le=1.0, description="Workplace hazard index")
    schedule_template: str = Field(..., description="Daily work schedule template")

class LocalRoadSchema(BaseModel):
    id: str = Field(..., description="Unique road ID")
    path: List[CoordinateSchema] = Field(..., description="Ordered list of coordinates representing the local street")
    road_type: Literal["footpath", "dirt", "stone", "dockwalk"] = Field(..., description="Material type of the local road")

class SettlementLayoutSchema(BaseModel):
    id: str = Field(..., description="Unique layout ID")
    settlement_id: str = Field(..., description="Associated settlement ID")
    seed: str = Field(..., description="Deterministic seed used to build layout")
    districts: List[DistrictSchema] = Field(..., description="Collection of districts")
    local_roads: List[LocalRoadSchema] = Field(..., description="Collection of local roads")
    buildings: List[BuildingSchema] = Field(..., description="Collection of buildings")
    production_chains: List[ProductionChainSchema] = Field(..., description="Collection of supply chains")
    job_slots: List[JobSlotSchema] = Field(..., description="Collection of job slots")
