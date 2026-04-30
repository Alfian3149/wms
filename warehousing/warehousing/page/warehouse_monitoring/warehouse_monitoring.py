import frappe

@frappe.whitelist()
def get_warehouse_stats():
    # Mengambil data dari DocType Warehouse dan Bin
    warehouses = frappe.db.sql("""
        SELECT 
            w.name as location,
            w.warehouse_type as zone,
            w.total_capacity as capacity,
            IFNULL(b.actual_qty, 0) as current_stock,
            w.is_reserved as reserved
        FROM `tabWarehouse` w
        LEFT JOIN `tabBin` b ON w.name = b.warehouse
        WHERE w.is_group = 0
    """, as_dict=True)
    
    return warehouses