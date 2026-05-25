import uvicorn
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from app.schemas.world import WorldResponse
from app.generators.world_pipeline import generate_full_world_slice

app = FastAPI(
    title="Chronicles of Eldoria - World Slice Engine",
    description="Python backend source of truth for deterministic procedural world generation.",
    version="1.0.0"
)

# Apply CORS middleware to permit browser access from the Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/world/generate", response_model=WorldResponse)
async def generate_world(seed: str = Query("Eldoria", description="Text seed for deterministic generation")):
    """
    GET API endpoint that generates a logically rich 128x128 region slice deterministically.
    """
    world_data = generate_full_world_slice(seed)
    return world_data

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
