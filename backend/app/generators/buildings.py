from typing import List, Dict, Any

def create_building_template(
    settlement_id: str,
    district_id: str,
    bld_type: str,
    x: int,
    y: int,
    width: int,
    height: int,
    tier: int,
    name: str,
    purpose: str,
    reasons: List[str],
    requires: List[str],
    produces: List[str],
    consumes: List[str]
) -> Dict[str, Any]:
    """
    Standard building schema dict compiler.
    """
    # Deterministic attributes based on coordinates/type
    condition = round(0.75 + ((x * y) % 25) / 100.0, 2)
    locked_at_night = bld_type not in ["tavern", "inn", "tavern/inn", "watch_post", "shrine"]
    public_access = bld_type in ["tavern", "inn", "tavern/inn", "shrine", "temple", "general_store", "shop"]
    obscurity_rating = 10 + (x + y) % 8
    price_mod = round(1.0 + ((x - y) % 30) / 100.0, 2)
    if bld_type == "tavern":
        price_mod = round(0.9 + ((x + y) % 15) / 100.0, 2)
        
    return {
        "id": f"bld_{settlement_id}_{bld_type}_{x}_{y}",
        "settlement_id": settlement_id,
        "district_id": district_id,
        "type": bld_type,
        "name": name,
        "x": int(x),
        "y": int(y),
        "width": int(width),
        "height": int(height),
        "rotation": float(0.0 if (x * y) % 2 == 0 else 1.57), # 0 or 90 deg rotation
        "tier": int(tier),
        "condition": float(condition),
        "purpose": purpose,
        "origin_reasons": reasons,
        "requires": requires,
        "produces": produces,
        "consumes": consumes,
        "job_slots": [], # populated later by job_slots.py
        "public_access": public_access,
        "locked_at_night": locked_at_night,
        "obscurity_rating": int(obscurity_rating),
        "price_modifier": float(price_mod),
        "tags": [bld_type, f"tier_{tier}"]
    }
