# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.model.naming import getseries
from frappe.utils import getdate, nowdate
import time
class ItemInspection(Document):
	def validate(self):
		if self.doc_status == 1:
			detail_table_field = "inspection_details"
			self.set(detail_table_field, [
				d for d in self.get(detail_table_field) if d.is_selected
			])

			new_itmreq = frappe.new_doc("Item Request")
			new_itmreq.purpose = "Return Supplier"
			new_itmreq.supplier = self.supplier
			new_itmreq.supplier_name = self.supplier_name
			new_itmreq.material_incoming_id = self.material_incoming_id
			new_itmreq.receiver = self.receiver
			new_itmreq.posting_date = getdate(nowdate())
			new_itmreq.required_by = self.return_for_date
			new_itmreq.requestor_by = frappe.session.user
			new_itmreq.target_location = self.return_location
			new_itmreq.doctype_source = "Item Inspection"
			new_itmreq.link = self.name

			purchase_order = ""
			for item in self.inspection_details:
				um, group =  frappe.db.get_value("Part Master", self.part, ["um", "item_group"])
				new_item = new_itmreq.append("items")
				new_item.site = "1000"
				new_item.purchase_order = item.purchase_order
				new_item.line_order = item.line_order
				new_item.part = item.part
				new_item.um = um
				new_item.quantity_requested = item.quantity
				new_item.quantity_picked = 0
				new_item.from_location = item.location
				new_item.lotserial = item.lotserial
				new_item.target_location = self.return_location
				new_item.supplier = item.supplier
				new_item.item_group = group

				purchase_order = item.purchase_order
			new_itmreq.purchase_order = purchase_order

			new_itmreq.insert()
			new_itmreq.submit()

	def autoname(self):
		today = getdate(nowdate())
		year = today.strftime("%y")
		label_prefix = f"QC-{year}-"
		label_running_number = getseries(label_prefix, 3)
		self.name = f"{label_running_number}-{year}"

@frappe.whitelist()
def get_incoming_information(part, lotserial): 
	incoming_no = frappe.db.get_value("Material Label", {"item":part, "lotserial":lotserial}, ["material_incoming_link"] )
	if incoming_no:
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
	time.sleep(1) 
	data = []
	inventory = frappe.db.get_list("Inventory", filters={"site":"1000", "part":part, "qty_on_hand": [">", 0]}, fields=["name", "part", "lot_serial", "qty_on_hand", "warehouse_location", "inventory_status"], order_by="lot_serial asc")

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
				"inventory_status": inv.inventory_status,
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
				"inventory_status": inv.inventory_status,
			})

	return {
		"status": "success",
		"messages" : "Data Found",
		"data": data,
	}

@frappe.whitelist()
def lotserial_selected(inv_id_list):
	if inv_id_list:
		data = []
		for inv in inv_id_list:
			get_inventory = frappe.get_doc("Inventory", inv)
			
	else:
		frappe.msgprint("No Inventory IDs selected.")