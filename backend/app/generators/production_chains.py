from typing import List, Dict, Any

def generate_production_chains(
    settlement_id: str,
    settlement_type: str,
    resources: List[str],
    buildings: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Deterministically generates production chain tracking payloads based on the
    settlement type, resource list, and available building IDs.
    """
    chains = []
    
    # 1. Timber chain
    if "Timber" in resources or settlement_type == "logging camp":
        logging_camp_ids = [b["id"] for b in buildings if "logging" in b["type"] or "lumber" in b["type"]]
        sawmill_ids = [b["id"] for b in buildings if "sawmill" in b["type"] or "mill" in b["type"]]
        carpenter_ids = [b["id"] for b in buildings if "carpenter" in b["type"] or "wood" in b["type"] or "blacksmith" in b["type"] or "tool" in b["type"]]
        
        involved = logging_camp_ids + sawmill_ids + carpenter_ids
        if involved:
            chains.append({
                "id": f"chain_timber_{settlement_id}",
                "inputs": ["prime_timber"],
                "processors": ["logging_camp_extraction", "sawmill_milling", "carpenter_finishing"],
                "outputs": ["lumber_planks", "wooden_goods"],
                "buildings_involved": involved,
                "settlement_id": settlement_id,
                "bottlenecks": ["log_haulage_capacity"] if not sawmill_ids else [],
                "failure_events": ["timber_infestation", "sawmill_blade_failure"]
            })
            
    # 2. Ore chain (Iron Ore / Gold)
    if any(r in resources for r in ["Iron Ore", "Gold"]) or settlement_type == "mining outpost":
        mine_ids = [b["id"] for b in buildings if "mine" in b["type"] or "extraction" in b["type"]]
        smelter_ids = [b["id"] for b in buildings if "smelter" in b["type"] or "blacksmith" in b["type"]]
        forge_ids = [b["id"] for b in buildings if "blacksmith" in b["type"] or "tool" in b["type"]]
        
        involved = mine_ids + smelter_ids + forge_ids
        if involved:
            res_label = "gold_veins" if "Gold" in resources else "iron_veins"
            out_label = "precious_ornaments" if "Gold" in resources else "iron_tools"
            chains.append({
                "id": f"chain_ore_{settlement_id}",
                "inputs": [res_label],
                "processors": ["subterranean_mining", "hearth_smelting", "anvil_forging"],
                "outputs": [out_label, "stone_slabs"],
                "buildings_involved": involved,
                "settlement_id": settlement_id,
                "bottlenecks": ["fuel_coal_scarcity"] if not smelter_ids else [],
                "failure_events": ["shaft_collapse", "forge_fire_outage"]
            })
            
    # 3. Grain/Agricultural chain
    if "Grain" in resources or settlement_type == "town":
        farm_ids = [b["id"] for b in buildings if "farm" in b["type"] or "house" in b["type"]][:2]
        mill_ids = [b["id"] for b in buildings if "mill" in b["type"]]
        tavern_ids = [b["id"] for b in buildings if "tavern" in b["type"] or "inn" in b["type"] or "hall" in b["type"]]
        
        involved = farm_ids + mill_ids + tavern_ids
        if involved:
            chains.append({
                "id": f"chain_grain_{settlement_id}",
                "inputs": ["grain_harvest"],
                "processors": ["wind_milling", "dough_kneading", "tavern_ale_brewing"],
                "outputs": ["wheat_flour", "fresh_bread", "barley_ale"],
                "buildings_involved": involved,
                "settlement_id": settlement_id,
                "bottlenecks": ["dry_spell_crop_shrinkage"] if not farm_ids else [],
                "failure_events": ["grain_weevil_rot", "millstone_fracture"]
            })
            
    # 4. Fish/Aquatic chain
    if "Fish" in resources or any(b["type"] in ["dock", "dockyard", "fishery"] for b in buildings):
        dock_ids = [b["id"] for b in buildings if "dock" in b["type"] or "fishery" in b["type"]]
        store_ids = [b["id"] for b in buildings if "store" in b["type"] or "tavern" in b["type"] or "granary" in b["type"]]
        
        involved = dock_ids + store_ids
        if involved:
            chains.append({
                "id": f"chain_fish_{settlement_id}",
                "inputs": ["fresh_catch"],
                "processors": ["deep_sea_netting", "salt_curing", "market_preservation"],
                "outputs": ["salted_fish", "oil_byproducts"],
                "buildings_involved": involved,
                "settlement_id": settlement_id,
                "bottlenecks": ["harbor_gale_lockdown"] if not dock_ids else [],
                "failure_events": ["net_shear_accidents", "brine_contamination"]
            })
            
    # Guarantee at least one fallback chain if none match
    if not chains:
        house_ids = [b["id"] for b in buildings if "house" in b["type"] or "bunk" in b["type"]]
        chains.append({
            "id": f"chain_basic_{settlement_id}",
            "inputs": ["raw_supplies"],
            "processors": ["manual_haulage", "household_crafting"],
            "outputs": ["subsistence_goods"],
            "buildings_involved": house_ids if house_ids else ["fallback_bld"],
            "settlement_id": settlement_id,
            "bottlenecks": ["labor_fatigue"],
            "failure_events": ["supply_wagon_delay"]
        })
        
    return chains
