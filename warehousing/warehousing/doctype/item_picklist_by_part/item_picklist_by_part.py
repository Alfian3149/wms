# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt

class ItemPicklistByPart(Document):
	pass

@frappe.whitelist()
def get_item_request_list(purpose):
	if purpose == 'For All' :
		item_request_list = frappe.get_all(
			"Item Request",
			filters={"docstatus": 1, "request_status": ["not in", ["Fully Picked", "Ready To Issued", "Completed"]]},
			fields=["name"],
		)
	else:
		item_request_list = frappe.get_all(
			"Item Request",
			filters={"docstatus": 1, "purpose": purpose, "request_status": ["not in", ["Fully Picked", "Ready To Issued", "Completed"]]},
			fields=["name"],
		)
	response = []
	for data in item_request_list:
		doc = frappe.db.get_value("Item Request Detail", {"parent": data.name}, ["*"], as_dict=True)
		if (flt(doc.quantity_requested) - flt(doc.quantity_picked)) > 0:
			response.append({
				"parent": doc.parent,
				"child": doc.name,
				"part": doc.part,
				"site": doc.site,
				"description": doc.description,
				"target_location": doc.target_location,
				"item_group": doc.item_group,
				"um": doc.um,
				"quantity_requested": doc.quantity_requested,
				"quantity_picked": doc.quantity_picked,
				"fullfilled": doc.fullfilled,
				"handovered": doc.handovered,
			})

	return response
