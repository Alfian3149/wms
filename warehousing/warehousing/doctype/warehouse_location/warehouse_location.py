# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe

from frappe.utils.nestedset import NestedSet
from frappe.model.document import Document
from frappe.utils import cint
from frappe.utils import getdate, flt
from warehousing.warehousing.utils.inventory_validator import InventoryValidator

class WarehouseLocation(NestedSet):
	# Field yang menentukan siapa induknya
	nsm_parent_field = 'parent_warehouse_location' 

class WarehouseLocation(Document):
	def validate(self):
		if len(self.name) > 8:
			frappe.throw("Warehouse Location name cannot exceed 8 characters.")
		
		if self.allowed_mixed_items == 1 and self.max_mixed_items <= 0:
			frappe.throw("Maximum Mixed Items must be greater than 0 when Allowed Mixed Items is checked.")

		weight_capacity = self.total_capacity
		pallet_capacity = self.total_pallet_maximum
		self.name = self.name.upper() 
		# Update massal
		frappe.db.sql("""
			UPDATE `tabPutaway Method Items`
			SET capacity = %s , pallet_limit = %s
			WHERE location = %s
		""", (weight_capacity, pallet_capacity, self.name))
		
		# Beritahu sistem bahwa data Putaway Method sudah berubah
		frappe.clear_cache(doctype="Putaway Method")
		


    #def on_update(self):
        # Memperbarui struktur pohon (lft, rgt) secara otomatis
    #    super("Warehouse Location", self).on_update()

@frappe.whitelist()
def get_children(doctype, parent=None, site=None, is_root=False):
	if is_root:
		parent = ""

	fields = ["name as value", "is_group as expandable"]
	filters = [
		["ifnull(`parent_warehouse_location`, '')", "=", parent],
		["site", "in", (site, None, "")],
	]

	return frappe.get_list(doctype, fields=fields, filters=filters, order_by="name")

@frappe.whitelist()
def add_node():
	from frappe.desk.treeview import make_tree_args

	args = make_tree_args(**frappe.form_dict)

	if cint(args.is_root):
		args.parent_warehouse = None

	frappe.get_doc(args).insert()

@frappe.whitelist()
def get_location_details(location):
	normalized_loc = location.strip().upper()
	rack = frappe.db.get_value("Warehouse Location", 
        {"name": normalized_loc, "is_group": 0}, 
        ["name", "warehouse_type", "site", "total_capacity", "um", "is_active"], 
        as_dict=1
    )
	if rack is None:
		#frappe.throw(f"Location {normalized_loc} not found", frappe.DoesNotExistError)
		return {
		"status": "error",
		"message": f"Lokasi {normalized_loc} tidak terdaftar di sistem.",
		"data": None
		}

	inventory_items = frappe.get_all("Inventory", 
        filters={"warehouse_location": normalized_loc, "qty_on_hand": [">", 0]},
        fields=["part", "qty_on_hand", "lot_serial","creation","expire_date"]
    )
	
	items_map = {}
	total_occupied = 0
	for inv in inventory_items:
		sku = inv.part
		total_occupied += 1
		item = frappe.db.get_value("Part Master", sku, ['description','um']) or sku
		
		if sku not in items_map:
			items_map[sku] = {
                "name": item[0],
                "um": item[1],
                "sku": sku,
                "totalQuantity": 0,
                "lotSerials": []
            }
		
		lot_info = {}
		if inv.lot_serial:
			lot_info = {
				"lotNumber": inv.lot_serial,
				"quantity": inv.qty_on_hand,
				"expiryDate": inv.expire_date.strftime('%Y-%m-%d') if inv.expire_date else None,
				"manufactureDate": inv.creation.strftime('%Y-%m-%d') if inv.creation else None
			}
		if not lot_info:
			lot_info = {"lotNumber": inv.lot_serial or "N/A", "quantity": inv.qty_on_hand, "manufactureDate": inv.creation.strftime('%Y-%m-%d'), "expiryDate": inv.expire_date.strftime('%Y-%m-%d') if inv.expire_date else None}
			
		items_map[sku]["totalQuantity"] += inv.qty_on_hand
		items_map[sku]["lotSerials"].append(lot_info)
	
	return {
		"status": "success",
        "message": "Data berhasil ditemukan",
		"data": {
			"rackId": rack.site or "N/A",
			"location": rack.name,
			"zone": rack.name[:1] or "N/A",
			"capacity": rack.total_capacity or 0,
			"um_capacity": rack.um ,
			"active": rack.is_active,
			"occupied": total_occupied,
			"items": list(items_map.values()) # Ubah dictionary kembali ke list
		}
    }

@frappe.whitelist()
def scan_rack_for_putaway(location, item, site="1000"):
	loc = frappe.get_doc("Warehouse Location", location)
	if loc.is_group: 
		{
		"status": "failed",
		"message": "Lokasi yang dipilih adalah group, bukan rack. Harap pilih lokasi yang benar.",
		"data": None
	}
	slot_used = frappe.db.count("Inventory", filters={'warehouse_location':location, 'qty_on_hand': ['>', 0]})

	total_free  = flt(loc.total_pallet_maximum) - flt(slot_used)
	if total_free <= 0:
		return {
			"status": "failed",
			"message": "Lokasi sudah penuh, tidak dapat digunakan untuk putaway.",
			"data": None
			}
	if not InventoryValidator(site, loc.name, item).is_allowed_suggestion():
		return {
			"status": "failed",
			"message": "Lokasi tidak memenuhi syarat untuk menyimpan item ini berdasarkan kondisi inventory saat ini.",
			"data": None
		}
	
	data = {}
	data[location] = {
		'rack': location,
		'location': location,
		'zone': location,
		'availableSpace':total_free,
		'capacity': loc.total_pallet_maximum if loc.total_pallet_maximum else 0,
		'slotUsed': slot_used,
		'itemKindCount': 0,
		'is_active': loc.is_active,
	}
	return {
		"status": "success",
		"message": "Data berhasil ditemukan",
		"data": data
	}