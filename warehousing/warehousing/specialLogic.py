import frappe

@frappe.whitelist()
def get_multi_bin_suggestion(site, part, qtyPallet):
    qtyPallet_to_allocate = qtyPallet
    suggestions = []
    
    bins_rules = frappe.db.sql("""
        SELECT 
            pm.site, 
            pm.part, 
            pm.warehouse_location, 
            pm.pallet_capacity, 
            pm.priority
        FROM 
            `tabPutawayMethod` pm
        INNER JOIN 
            `tabWarehouseLocation Method` wl ON pm.warehouse_name = wl.warehouse_name
        WHERE 
            pm.site = %(site)s 
            pm.part = %(part)s 
            AND wl.is_active = 1 
            AND wl.is_group = 0
        ORDER BY 
            pm.priority ASC
    """, (putaway_method), as_dict=True)

    if not bins_rules:
        frappe.throw(_("Tidak ada lokasi aktif yang terdaftar dalam Putaway Method: {0}").format(putaway_method))

    for b in bins_rules:
        if qtyPallet_to_allocate <= 0:
            break

        total_bin_used = frappe.db.get_value("Inventory", filters={"site":b.site, "warehouse_location": b.warehouse_location, "qty_on_hand":[">", 0]}, fieldname="count(name)")

        # Kapasitas diambil dari tabel Putaway Method (b.capacity)
        remaining_pallet_capacity = b.pallet_capacity - total_bin_used

        if remaining_pallet_capacity > 0:
            
            suggestions.append({
                "site": b.site,
                "part": b.part,
                "location": b.warehouse_location,
                "priority": b.priority, 
                "pallet_covered": remaining_pallet_capacity if qtyPallet_to_allocate >  remaining_pallet_capacity else qtyPallet_to_allocate, 
            })
            
            qtyPallet_to_allocate -= remaining_pallet_capacity

    return {
        "status": "success" if qtyPallet_to_allocate <= 0 else "partial",
        "suggestions": suggestions,
        "unallocated_qty": qtyPallet_to_allocate
    }