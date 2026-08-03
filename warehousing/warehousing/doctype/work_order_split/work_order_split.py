# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt
from warehousing.warehousing.utils.wo_validation import WorkOrderValidator
from frappe import _
from frappe.model.naming import getseries
class WorkOrderSplit(Document):
	def autoname(self):
		year = frappe.utils.nowdate()[:4][-2:] #2 digit year
		label_prefix = f"MTS-{year}"
		label_running_number = getseries(label_prefix, 5)
		self.name = f"{year}{label_running_number}"

	def on_cancel(self):
		for row in self.work_order_split_detail:
				frappe.db.set_value('Work Order Split Detail', row.name, 'is_closed', 1)

		item_req = frappe.get_doc("Item Request", self.link_to_item_request)
		""" for item in item_req.items:
			if item.status != 'Completed' : 
				frappe.db.set_value(item.doctype, item.name, "status", "Cancelled") """
		item_req.docstatus = 2
		item_req.save()

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
					new_item.work_order = self.work_order
					new_item.part = item.part
					new_item.um = item.um
					new_item.quantity_requested = item.qty_confirm
					new_item.quantity_picked = 0
					new_item.target_location = self.shopfloor_location
					new_item.item_group = item.item_group
					new_item.prd_line = self.production_line
					new_item.mts_detail = item.name
					new_item.free_qty = item.free_qty
					new_item.free_qty_usage = item.free_qty_usage
				new_itmreq.insert()
				new_itmreq.submit()
				
				self.db_set("link_to_item_request", new_itmreq.name)
			""" else: 
				frappe.throw(_("You can submit this form because there is no material request.")) """

			
@frappe.whitelist() 
def get_stock_availability_in_production(site, part, warehouse_location, wo_number=None):
	#getStock = frappe.db.get_value("Inventory", {"site": site, "part": part, "warehouse_location": warehouse_location}, "SUM(qty_on_hand) as qty_on_hand")
	getStock = frappe.db.sql("""
	SELECT 
			SUM(inv.qty_on_hand) as qty_on_hand
		FROM 
			`tabInventory` inv
		WHERE 
			inv.site = %(site)s 
			AND inv.part = %(part)s 
			AND inv.warehouse_location = %(warehouse_location)s 
			AND inv.inventory_status = %(status)s
	""", {
		"site": site,
		"part": part,
		"warehouse_location": warehouse_location,
		"status": "P-GOOD"
	}, as_dict=True)

	
	#getQtyRequested =  frappe.db.get_value("Work Order Split Detail", {"part": part,  "is_closed": 0, "parent": ['not like', f"%{wo_split_number}%"]}, "SUM(actual_required) as actual_required")
	#getQtyRequested =  frappe.db.get_value("Work Order Split Detail", {"part": part,  "is_closed": 0}, "SUM(actual_required) as actual_required")

	target_statuses = ["", "Partially", "Picked"]
	result = frappe.db.sql("""
        SELECT 
            SUM(COALESCE(child.quantity_requested, 0) - COALESCE(child.quantity_picked, 0) - COALESCE(child.fullfilled_qty, 0) - COALESCE(child.handovered, 0)) as total_outstanding
        FROM 
            `tabItem Request Detail` child
        WHERE 
			child.parenttype = 'Item Request'
			AND child.part = %s
			AND child.status != 'Cancelled'
    """, (part), as_dict=True)
    
	getOutstanding = result[0].get("total_outstanding") if result and result[0].get("total_outstanding") else 0
	if getOutstanding <= 0 : 
		getOutstanding = 0

	availability = 0
	if getStock and getStock[0].qty_on_hand is not None:
		availability = getStock[0].qty_on_hand
	if getOutstanding :
		availability -= getOutstanding
	
	if availability < 0:
		availability = 0

	return {
		"outstanding" : getOutstanding ,
		"availability": availability
	}

@frappe.whitelist() 
def get_material_transfer_slip_history_by_wo(work_order):
	getList = frappe.db.get_list("Work Order Split", filters={'work_order':work_order}, fields=['work_order', 'name', 'work_order_split_detail', 'posting_date', 'finish_good', 'fg_description', 'um', 'status', 'quantity_to_be_produced_immediately', 'quantity_ordered', 'quantity_completed', 'quantity_rejected', 'shopfloor_location', 'link_to_item_request'],
	order_by='posting_date desc',
	
	)

	for doc in getList:
		doc["items"] = frappe.db.get_all("Work Order Split Detail", filters={"parent":doc.name, "qty_confirm": [">", 0]}, fields=["part","qty_confirm","description", "um", "item_group"])

	return getList

@frappe.whitelist()
def get_work_order_split_detail(component):
	""" summary = frappe.db.get_all(
    "Work Order Split Detail",
    filters={'part': component},
    fields=['sum(free_qty) as total_free_qty', 'sum(free_qty_usage) as total_free_qty_usage']) """

	summary = frappe.db.sql("""
    SELECT 
        SUM(child.free_qty) AS total_free_qty,
        SUM(child.free_qty_usage) AS total_free_qty_usage
    FROM 
        `tabWork Order Split Detail` child
    INNER JOIN 
        `tabWork Order Split` parent ON child.parent = parent.name
    WHERE 
        child.part = %s 
        AND parent.docstatus = 1 
""", (component,), as_dict=True)

	if summary:
		total_free = summary[0].get('total_free_qty') or 0
		total_usage = summary[0].get('total_free_qty_usage') or 0
	else:
		total_free = 0
		total_usage = 0

	qty_can_be_used = flt(total_free) - flt(total_usage)

	return qty_can_be_used

