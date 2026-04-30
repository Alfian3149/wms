# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt
from warehousing.warehousing.utils.wo_validation import WorkOrderValidator
from frappe import _
class WorkOrderSplit(Document):
	def on_cancel(self):
		for row in self.work_order_split_detail:
				frappe.db.set_value('Work Order Split Detail', row.name, 'is_closed', 1)

	def validate(self):
		if self.quantity_to_be_produced_immediately <= 0 : 
			frappe.throw(_("Quantity to be produced must greater than 0"))
			

		#FINISH GOOD ITEM
		if not frappe.db.exists("Part Master", self.finish_good):
			new_item = frappe.get_doc({
				"doctype": "Part Master",
				"part": self.finish_good,
				"um": self.um,
				"description": self.fg_description,
				"qty_per_pallet": self.fg_qty_per_pallet
				})
			new_item.insert()
		validator = WorkOrderValidator(self.work_order)
		validator.qty_tobe_produced(self.quantity_to_be_produced_immediately)
		
		if self.status == "Completed": 
			for row in self.work_order_split_detail:
				frappe.db.set_value('Work Order Split Detail', row.name, 'is_closed', 1)
		#COMPONENT ITEM
		self.ensure_item_details_exist_in_master()

	def ensure_item_details_exist_in_master(self):
		for row in self.work_order_split_detail:
			if not frappe.db.exists("Part Master", row.part):
				self.create_new_item(row)
				
	def create_new_item(self, row):
		new_item = frappe.get_doc({
			"doctype": "Part Master",
			"part": row.part,
			"um": row.um,
			"description": row.description,
			"qty_per_pallet": row.qty_per_pallet,
		})
		new_item.insert()


	def on_submit(self): 

		if self.is_create_mts:
			any_qty_requested = frappe.db.exists("Work Order Split Detail", {"parent": self.name, "qty_confirm": [">", 0]})
			
			if any_qty_requested :
				new_itmreq = frappe.new_doc("Item Request")
				new_itmreq.purpose = "Manufacture"
				new_itmreq.posting_date = self.posting_date
				new_itmreq.required_by = self.required_by
				new_itmreq.requestor_by = frappe.session.user
				new_itmreq.target_location = self.shopfloor_location
				new_itmreq.doctype_source = "Work Order Split"
				new_itmreq.link = self.name

				for item in self.work_order_split_detail:
					if item.qty_confirm <= 0 : 
						continue
					""" qty_needed = 0
					if method == 1: # berdasarkan actual required
						qty_needed = flt(item.actual_required)
					elif method == 2: # berdasarkan ketersediaan
						qty_needed = flt(item.actual_required) - flt(item.availability)
					else :
						qty_needed = flt(item.actual_required) """

					new_item = new_itmreq.append("items")
					new_item.site = self.site
					new_item.part = item.part
					new_item.um = item.um
					new_item.quantity_requested = item.qty_confirm
					new_item.quantity_picked = 0
					new_item.target_location = self.shopfloor_location
					new_item.item_group = item.item_group
				new_itmreq.insert()
				new_itmreq.submit()
				
				self.db_set("link_to_item_request", new_itmreq.name)
			""" else: 
				frappe.throw(_("You can submit this form because there is no material request.")) """

			
@frappe.whitelist() 
def get_stock_availability_in_production(site, part, warehouse_location, wo_split_number=None):
	#getStock = frappe.db.get_value("Inventory", {"site": site, "part": part, "warehouse_location": warehouse_location}, "SUM(qty_on_hand) as qty_on_hand")
	getStock = frappe.db.sql("""
            SELECT 
                SUM(inv.qty_on_hand) as qty_on_hand
            FROM 
                `tabInventory` inv
            JOIN 
                `tabWarehouse Location` loc ON inv.warehouse_location = loc.name
            WHERE 
                inv.site = %(site)s 
                AND inv.part = %(part)s 
                AND inv.inventory_status = %(status)s
                AND loc.is_active = 1 
                AND loc.can_reserved_for_wo_comp_issued = 1
        """, {
            "site": site,
            "part": part,
            "status": "P-GOOD"
        }, as_dict=True)

	
	#getQtyRequested =  frappe.db.get_value("Work Order Split Detail", {"part": part,  "is_closed": 0, "parent": ['not like', f"%{wo_split_number}%"]}, "SUM(actual_required) as actual_required")
	getQtyRequested =  frappe.db.get_value("Work Order Split Detail", {"part": part,  "is_closed": 0}, "SUM(actual_required) as actual_required")

	#getReserved = frappe.db.get_value("Reserved Task Entry", {"site": site, "part": part, "destination_location": warehouse_location}, "SUM(qty) as qty")
	#print(f"Item: {part}, getStock: {getStock}, getQtyRequested: {getQtyRequested}")
	availability = 0
	if getStock and getStock[0].qty_on_hand is not None:
		availability = getStock[0].qty_on_hand
	if getQtyRequested :
		availability -= getQtyRequested
	
	if availability < 0:
		availability = 0

	return {"availability": availability}

@frappe.whitelist() 
def get_material_transfer_slip_history_by_wo(work_order):
	getList = frappe.db.get_list("Work Order Split", filters={'work_order':work_order}, fields=['work_order', 'name', 'work_order_split_detail', 'posting_date', 'finish_good', 'fg_description', 'um', 'status', 'quantity_to_be_produced_immediately', 'quantity_ordered', 'quantity_completed', 'quantity_rejected', 'shopfloor_location', 'link_to_item_request'],
	order_by='posting_date desc',
	
	)

	for doc in getList:
		doc["items"] = frappe.db.get_all("Work Order Split Detail", filters={"parent":doc.name, "qty_confirm": [">", 0]}, fields=["part","qty_confirm","description", "um", "item_group"])

	return getList