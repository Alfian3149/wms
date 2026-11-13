import frappe

class InventoryValidator:
    def __init__(self, site, location, item_code=None):
        self.site = site
        self.location = location
        self.item_code = item_code

    def validate(self):
        # Add validation logic here
        pass

    def is_allowed_suggestion(self):
        locationMixedItemRules = frappe.db.get_value("Warehouse Location", self.location, ["allowed_mixed_items", "max_mixed_items"], as_dict=True)

        is_allowed = False

        if locationMixedItemRules.allowed_mixed_items == 0:
            # Jika lokasi tidak mengizinkan mixed items, pastikan tidak ada inventory lain di lokasi tersebut
            exists = frappe.db.exists("Inventory", {
                "site": self.site,
                "warehouse_location": self.location,
                "part": ["!=", self.item_code],
                "qty_on_hand": [">", 0]
            })
            if not exists:
                is_allowed = True
        else:
            # Jika lokasi mengizinkan mixed items, pastikan jumlah item berbeda tidak melebihi max_mixed_items

            result = frappe.db.sql("""
                SELECT COUNT(DISTINCT part) 
                FROM `tabInventory` 
                WHERE site = %s AND warehouse_location = %s AND part <> %s AND qty_on_hand > 0
            """, (self.site, self.location, self.item_code), as_list=True)

            item_count = result[0][0] if result else 0
            is_allowed = item_count < locationMixedItemRules.max_mixed_items

        return is_allowed
