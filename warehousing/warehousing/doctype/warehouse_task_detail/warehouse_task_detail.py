# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from warehousing.warehousing.doctype.inventory.inventory import update_inventory_qty
from frappe.utils import getdate,  nowdate, formatdate
from warehousing.warehousing.doctype.stock_ledger.stock_ledger import make_sl_entry
from frappe import _

class WarehouseTaskDetail(Document):
	def update_transferred(self):
		default_site = frappe.db.get_single_value("Material Incoming Control", "default_site")
		wsa = frappe.db.get_single_value("Qad Integrations", "url")
		
		details = []
		effDate = str(getdate(nowdate()))
		if self.execution_time: 
			effDate = str(getdate(self.execution_time))

		details.append({
			"ptPart":self.item,
			"qty":self.qty_confirmation,
			"effDate":effDate,
			"rmks":self.name,
			"siteFrom":default_site,
			"locFrom":self.locationsource,
			"lotserFrom":self.lotserial,
			"lotrefFrom":"",
			"siteTo":default_site,
			"locTo":self.locationdestination,
			"lotserTo":self.lotserial,
			"lotrefTo":"",
			"usefrom":True,
			"useto":False,
		})

		api_transfer = frappe.call("warehousing.warehousing.api_transfer.transfer_submit_detail_task", details=details, ref_doctype="Warehouse Task Detail", doc_name=self.name, wsa=wsa)
		
		if api_transfer.get("status") == "success":
			if not self.executor :
				self.executor = frappe.session.user
				self.execution_time = frappe.utils.now()

			self.transferred = True
			ref = ""
			posting_date = getdate(self.execution_time)

			getAtrribute = frappe.db.get_value("Inventory", {"site": default_site, "part": self.item, "lot_serial": self.lotserial, "reference": None, "warehouse_location": self.locationsource}, ["name", "qty_on_hand", "inventory_status", "expire_date"], as_dict=True)

			if not getAtrribute: 
				frappe.throw(
					msg=_("Item {0} with lot Serial {1} not found in location {2}").format(self.item, self.lotserial, self.locationsource),
					title=_("ERROR"),
					exc=frappe.ValidationError
				)

			create_stock_ledger_from_external_trans = frappe.db.get_single_value('Qad Integrations', 'create_stock_ledger_from_external_trans')
			if create_stock_ledger_from_external_trans == False:
				data = {
					"doctype_source":"Warehouse Task Detail",
					"data_link":self.name,
					"transType":"ISS-TR",
					"site":default_site,
					"part":self.item,
					"lotSerial":self.lotserial,
					"location":self.locationsource,
					"invStatus":getAtrribute.inventory_status,
					"qtyChg":self.qty_confirmation,
					"postingDate":posting_date,
					"invExpire": getAtrribute.expire_date,
					"poNumber":None,
					"poLine":None
				}
				init_sl = make_sl_entry(**data)
				init_sl.create_new()

				data = {
					"doctype_source":"Warehouse Task Detail",
					"data_link":self.name,
					"transType":"RCT-TR",
					"site":default_site,
					"part":self.item,
					"lotSerial":self.lotserial,
					"location":self.locationdestination,
					"invStatus":getAtrribute.inventory_status,
					"qtyChg":self.qty_confirmation,
					"postingDate":posting_date,
					"invExpire":getAtrribute.expire_date,
					"poNumber":None,
					"poLine":None
				}
				init_sl = make_sl_entry(**data)
				init_sl.create_new()