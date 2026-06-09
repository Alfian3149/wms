# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.model.naming import getseries
from frappe.utils import getdate, nowdate

class ItemInspection(Document):
	def autoname(self):
		today = getdate(nowdate())
		year = today.strftime("%y")
		label_prefix = f"QC-{year}-"
		label_running_number = getseries(label_prefix, 3)
		self.name = f"{label_running_number}-{year}"

@frappe.whitelist()
def get_incoming_information(part, lotserial): 
	incoming_no = frappe.db.get_value("Material Label", {"item":part, "lotserial":lotserial}, ["material_incoming_link"] )
	mt_incoming = frappe.get_doc("Material Incoming", incoming_no)
	if mt_incoming : 
		return {
			"status": "success",
			"message": "Data found",
			"data" : mt_incoming
		}
	
	return {
		"status": "failed",
		"message": "Data not found",
		"data" : []

	}

@frappe.whitelist()
def get_item_received(part): 
	data = []
	inventory = frappe.db.get_list("Inventory", filters={"site":"1000", "part":part}, fields=["name", "part", "lot_serial", "qty_on_hand", "warehouse_location"], order_by="lot_serial asc")

	if not inventory: 
		return {
			"status": "failed",
			"messages" : "Data not Found",
			"data": [],
		}
	for inv in inventory : 
		label = frappe.db.get_value("Material Label", {"item": inv.part, "lotserial": inv.lot_serial}, ["material_incoming_link"])  
		if label:
			mtl_incoming = frappe.get_doc("Material Incoming", label) 
			data.append({
				"receiver":mtl_incoming.receiver,
				"date_received": mtl_incoming.transaction_date,
				"supplier": mtl_incoming.supplier,
				"supplier_name": mtl_incoming.supplier_name,
				"inv_name": inv.name,
				"lot_serial": inv.lot_serial,
				"location": inv.warehouse_location,
				"stock": inv.qty_on_hand,
			})
		else :
			data.append({
				
				"receiver": "",
				"date_received": "",
				"supplier": "",
				"supplier_name": "",
				"inv_name": inv.name,
				"lot_serial": inv.lot_serial,
				"location": inv.warehouse_location,
				"stock": inv.qty_on_hand,
			})

	return {
		"status": "success",
		"messages" : "Data Found",
		"data": data,
	}

@frappe.whitelist()
def lotserial_selected(inv_id_list):
	if inv_id_list:
		inv_id_str = ','.join([f'"{inv_id}"' for inv_id in inv_id_list])
		frappe.msgprint(f"Selected Inventory IDs: {inv_id_str}")
	else:
		frappe.msgprint("No Inventory IDs selected.")