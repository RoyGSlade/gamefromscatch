from pydantic import BaseModel, Field
from typing import Literal

class ResourceSchema(BaseModel):
    id: str = Field(..., description="Unique resource node ID")
    x: int = Field(..., ge=0, le=127, description="X coordinate of the resource node")
    y: int = Field(..., ge=0, le=127, description="Y coordinate of the resource node")
    type: Literal["Iron Ore", "Gold", "Timber", "Fish"] = Field(..., description="Type of the natural resource")
    origin_reason: str = Field(..., description="Descriptive geological explanation for this node placement")
