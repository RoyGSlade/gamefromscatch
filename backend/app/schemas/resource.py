from pydantic import BaseModel, Field
from typing import Literal

RESOURCE_TYPES = Literal[
    "Iron Ore", "Copper", "Coal",
    "Gold", "Silver",
    "Mithril", "Arcane Crystals",
    "Timber", "Swamp Herbs", "Toxic Mosses", "Oasis Botanicals",
    "Fish",
]

RESOURCE_CATEGORIES = Literal[
    "industrial_ore", "precious", "arcane", "botanical", "aquatic",
]

class ResourceSchema(BaseModel):
    id: str = Field(..., description="Unique resource node ID")
    x: int = Field(..., ge=0, le=127, description="X coordinate of the resource node")
    y: int = Field(..., ge=0, le=127, description="Y coordinate of the resource node")
    type: RESOURCE_TYPES = Field(..., description="Type of the natural resource")
    category: RESOURCE_CATEGORIES = Field(..., description="Resource category grouping")
    origin_reason: str = Field(..., description="Descriptive geological explanation for this node placement")
