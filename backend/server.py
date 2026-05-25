import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any

from core.config import GRID_SIZE
from generators.tectonics import generate_continents
from generators.topography import process_topography

# We use ORJSONResponse for "pristine, compressed JSON object" returning quickly.
# If orjson is not installed, we fallback to standard Response but FastAPI handles dicts fine.
app = FastAPI(title="Chronicles of Eldoria - World Generation Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class WorldResponse(BaseModel):
    seed: str
    width: int
    height: int
    cells: List[Dict[str, Any]]
    rivers: List[Dict[str, Any]]

@app.get("/api/world/generate", response_class=ORJSONResponse)
async def generate_world(seed: str = "Eldoria"):
    """
    Executes the full pipeline and returns the compressed JSON world array grid.
    """
    seed_int = sum(ord(c) for c in seed)
    
    # Pipeline Step 1: Tectonic Generation
    elevation = generate_continents(GRID_SIZE, GRID_SIZE, seed)
    
    # Pipeline Step 2: Topography & Routing
    biomes, rivers, hillshade = process_topography(elevation, seed_int)
    
    # Flatten grid data into cell objects for the frontend
    # To compress the JSON, we only include necessary fields
    cells = []
    
    # We can optimize the grid by not returning float64 precision. Round to 3 decimals.
    elev_rounded = elevation.round(3)
    hill_rounded = hillshade.round(3)
    
    for y in range(GRID_SIZE):
        for x in range(GRID_SIZE):
            cells.append({
                "x": x,
                "y": y,
                "e": float(elev_rounded[y, x]), # elevation
                "b": str(biomes[y, x]),         # biome
                "h": float(hill_rounded[y, x])  # hillshade
            })
            
    # Return as dict which FastAPI compresses automatically
    return {
        "seed": seed,
        "width": GRID_SIZE,
        "height": GRID_SIZE,
        "cells": cells,
        "rivers": rivers
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
