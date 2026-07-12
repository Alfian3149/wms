import frappe

def delete_zero_quantity_items():
    items = frappe.get_all("Inventory", filters={"qty_on_hand": 0}, fields=["name"])
    for item in items:
        frappe.delete_doc("Inventory", item.name, force=True)
    if items : 
        frappe.logger().info(f"Scheduler delete_zero_quantity_items selesai. Menghapus {len(items)} item dengan kuantitas nol.")
        frappe.db.commit()