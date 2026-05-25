from typing import List, Dict, Any

def generate_job_slots(settlement_id: str, building: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Deterministically generates job slot payloads for a building based on its type and tier.
    """
    bld_id = building["id"]
    bld_type = building["type"]
    bld_tier = building["tier"]
    
    jobs = []
    
    if bld_type in ["town_hall", "reeve_house"]:
        jobs.append({
            "id": f"job_{bld_id}_reeve",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Reeve" if bld_type == "town_hall" else "Bailiff",
            "count": 1,
            "required_skills": ["Leadership", "Administration", "Law"],
            "social_importance": 5,
            "danger_level": 0.1,
            "schedule_template": "08:00-17:00 Administrative Office"
        })
        jobs.append({
            "id": f"job_{bld_id}_clerk",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Scribe",
            "count": int(bld_tier),
            "required_skills": ["Literacy", "Bookkeeping"],
            "social_importance": 3,
            "danger_level": 0.05,
            "schedule_template": "09:00-17:00 Recording Office"
        })
        
    elif bld_type in ["tavern", "inn", "tavern/inn"]:
        jobs.append({
            "id": f"job_{bld_id}_innkeeper",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Innkeeper",
            "count": 1,
            "required_skills": ["Barter", "Socializing", "Brewing"],
            "social_importance": 3,
            "danger_level": 0.2,
            "schedule_template": "12:00-23:00 Tavern Floor"
        })
        jobs.append({
            "id": f"job_{bld_id}_hand",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Kitchen Hand",
            "count": int(bld_tier),
            "required_skills": ["Cooking", "Service"],
            "social_importance": 1,
            "danger_level": 0.15,
            "schedule_template": "11:00-20:00 Pantry"
        })
        if bld_tier >= 3:
            jobs.append({
                "id": f"job_{bld_id}_bouncer",
                "settlement_id": settlement_id,
                "building_id": bld_id,
                "role": "Tavern Guard",
                "count": 1,
                "required_skills": ["Intimidation", "Brawling"],
                "social_importance": 2,
                "danger_level": 0.4,
                "schedule_template": "18:00-02:00 Portal Guard"
            })
            
    elif bld_type in ["blacksmith", "toolmaker"]:
        jobs.append({
            "id": f"job_{bld_id}_smith",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Blacksmith",
            "count": 1,
            "required_skills": ["Metalworking", "Strength", "Barter"],
            "social_importance": 4,
            "danger_level": 0.45,
            "schedule_template": "07:00-16:00 Anvil Hearth"
        })
        jobs.append({
            "id": f"job_{bld_id}_apprentice",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Apprentice Smith",
            "count": int(bld_tier),
            "required_skills": ["Bellows_Operation", "Strength"],
            "social_importance": 1,
            "danger_level": 0.5,
            "schedule_template": "06:00-18:00 Coal Hauling & Bellows"
        })
        
    elif bld_type in ["general_store", "shop"]:
        jobs.append({
            "id": f"job_{bld_id}_merchant",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Merchant",
            "count": 1,
            "required_skills": ["Barter", "Appraisal", "Literacy"],
            "social_importance": 4,
            "danger_level": 0.1,
            "schedule_template": "08:00-18:00 Counter Sales"
        })
        
    elif bld_type in ["shrine", "temple"]:
        jobs.append({
            "id": f"job_{bld_id}_priest",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Priest",
            "count": 1,
            "required_skills": ["Theology", "Healing", "Consolation"],
            "social_importance": 5,
            "danger_level": 0.05,
            "schedule_template": "06:00-18:00 Altar Sacrifices"
        })
        jobs.append({
            "id": f"job_{bld_id}_acolyte",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Acolyte",
            "count": int(bld_tier),
            "required_skills": ["Candle_Lighting", "Chanting"],
            "social_importance": 2,
            "danger_level": 0.05,
            "schedule_template": "05:00-21:00 Sanctuary Cleanliness"
        })
        
    elif bld_type in ["granary", "storehouse", "warehouse"]:
        jobs.append({
            "id": f"job_{bld_id}_keeper",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Storehouse Keeper",
            "count": 1,
            "required_skills": ["Inventorying", "Lockpicking_Defense"],
            "social_importance": 3,
            "danger_level": 0.1,
            "schedule_template": "08:00-17:00 Loading Dock Accounts"
        })
        jobs.append({
            "id": f"job_{bld_id}_loader",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Laborer",
            "count": int(bld_tier) * 2,
            "required_skills": ["Heavy_Lifting"],
            "social_importance": 1,
            "danger_level": 0.35,
            "schedule_template": "07:00-17:00 Crate Haulage"
        })
        
    elif bld_type == "sawmill":
        jobs.append({
            "id": f"job_{bld_id}_sawyer",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Master Sawyer",
            "count": 1,
            "required_skills": ["Timber_Appraisal", "Mechanical_Sawing"],
            "social_importance": 3,
            "danger_level": 0.5,
            "schedule_template": "07:00-16:00 Blade Feed"
        })
        jobs.append({
            "id": f"job_{bld_id}_cutter",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Sawyer Assistant",
            "count": int(bld_tier),
            "required_skills": ["Heavy_Lifting"],
            "social_importance": 1,
            "danger_level": 0.6,
            "schedule_template": "06:00-16:00 Log Feeder Pit"
        })
        
    elif bld_type == "mill":
        jobs.append({
            "id": f"job_{bld_id}_miller",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Miller",
            "count": 1,
            "required_skills": ["Grain_Milling", "Windmill_Maintenance"],
            "social_importance": 3,
            "danger_level": 0.3,
            "schedule_template": "06:00-17:00 Millstone Grinding"
        })
        
    elif bld_type in ["mine_entrance", "shaft_elevator"]:
        jobs.append({
            "id": f"job_{bld_id}_foreman",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Mining Foreman",
            "count": 1,
            "required_skills": ["Leadership", "Structural_Safety", "Vein_Discovery"],
            "social_importance": 4,
            "danger_level": 0.4,
            "schedule_template": "07:00-17:00 Shaft Safety Check"
        })
        jobs.append({
            "id": f"job_{bld_id}_miner",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Miner",
            "count": int(bld_tier) * 3,
            "required_skills": ["Pickaxing", "Stamina", "Subterranean_Orientation"],
            "social_importance": 1,
            "danger_level": 0.65,
            "schedule_template": "08:00-18:00 Deep Shaft Pick"
        })
        jobs.append({
            "id": f"job_{bld_id}_driver",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Cart Driver",
            "count": int(bld_tier),
            "required_skills": ["Animal_Handling", "Hauling"],
            "social_importance": 2,
            "danger_level": 0.3,
            "schedule_template": "07:00-17:00 Surface Rail Haul"
        })
        
    elif bld_type in ["logging_yard", "sawmill_log_yard"]:
        jobs.append({
            "id": f"job_{bld_id}_logger_foreman",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Logging Foreman",
            "count": 1,
            "required_skills": ["Leadership", "Timber_Safety"],
            "social_importance": 3,
            "danger_level": 0.35,
            "schedule_template": "07:00-16:00 Forest Boundary Sweep"
        })
        jobs.append({
            "id": f"job_{bld_id}_logger",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Logger",
            "count": int(bld_tier) * 3,
            "required_skills": ["Axework", "Stamina", "Heavy_Lifting"],
            "social_importance": 1,
            "danger_level": 0.55,
            "schedule_template": "06:00-16:00 Tree Felling Sector"
        })
        
    elif "house" in bld_type or "bunk" in bld_type:
        jobs.append({
            "id": f"job_{bld_id}_weaver",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Weaver" if bld_tier >= 2 else "Laborer",
            "count": 1,
            "required_skills": ["Weaving"] if bld_tier >= 2 else ["Heavy_Lifting"],
            "social_importance": 2 if bld_tier >= 2 else 1,
            "danger_level": 0.1,
            "schedule_template": "09:00-17:00 Home Loom"
        })
        
    else:
        # Fallback guard / laborer
        jobs.append({
            "id": f"job_{bld_id}_guard",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "Perimeter Guard",
            "count": 1,
            "required_skills": ["Alertness", "Swordfighting"],
            "social_importance": 2,
            "danger_level": 0.4,
            "schedule_template": "18:00-06:00 Wall Sentry"
        })
        jobs.append({
            "id": f"job_{bld_id}_labor",
            "settlement_id": settlement_id,
            "building_id": bld_id,
            "role": "General Laborer",
            "count": 1,
            "required_skills": ["Heavy_Lifting"],
            "social_importance": 1,
            "danger_level": 0.3,
            "schedule_template": "08:00-17:00 Maintenance Pit"
        })
        
    return jobs
