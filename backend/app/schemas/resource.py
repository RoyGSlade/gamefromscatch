from pydantic import BaseModel, Field
from typing import Literal

class ResourceSchema(BaseModel):
    id: str
    x: int = Field(..., ge=0, le=127)
    y: int = Field(..., ge=0, le=127)
    type: Literal["Iron Ore", "Gold", "Timber", "Fish"]
    origin_reason: str
