# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import nowdate
from frappe.model.naming import getseries
from frappe.utils import flt
from warehousing.warehousing.doctype.inventory.inventory import create_inventory_record

class StockLedger(Document):
	def autoname(self):
		date_str = nowdate()
		year_month = date_str[2:4] + date_str[5:7]
		label_prefix = f"LEDGER-{year_month}-"
		label_running_number = getseries(label_prefix, 5)
		self.name = f"{year_month}-{label_running_number}"

	def on_submit(self):
		if self.inventory_doc_link:
			update_data = {
            'qty_on_hand': self.qty_after_transaction
			}
			if self.status:
				update_data['inventory_status'] = self.status

			if self.expire_date:
				update_data['expire_date'] = self.expire_date

			frappe.db.set_value('Inventory', self.inventory_doc_link, update_data)
		else: 
			create_inventory_record(self.site, self.part, self.lot_serial, None, self.warehouse_location, self.qty_after_transaction, self.status, self.expire_date)


class make_sl_entry:
	def __init__(self, **kwargs):
		self.doctype = kwargs.get("doctype")
		self.doctype_link = kwargs.get("doctype_link")
		self.transType = kwargs.get("transType")
		self.site = kwargs.get("site")
		self.part = kwargs.get("part")
		self.lotSerial = kwargs.get("lotSerial")
		self.location = kwargs.get("location")
		self.qtyChg = kwargs.get("qtyChg")
		self.invStatus = kwargs.get("invStatus")
		self.invExpire = kwargs.get("invExpire")
		self.poNumber = kwargs.get("poNumber")
		self.poLine = int(kwargs.get("poLine")) if kwargs.get("poLine") else 0
		self.postingDate = kwargs.get("postingDate")
		self.inventory_doc_link = None
		self.reference = None
		self.newBalance = 0
		self.inOut = None 

	def existingConsideration(self):
		invExisting = frappe.db.get_value("Inventory", 
        {"site": self.site, "part": self.part, "lot_serial": self.lotSerial, "reference": self.reference, "warehouse_location": self.location}, ["name", "qty_on_hand", "inventory_status", "expire_date"], as_dict=True)

		current_qty = 0
		if invExisting : 
			current_qty = invExisting.qty_on_hand
			self.inventory_doc_link = invExisting.name
			self.invExpire = invExisting.expire_date
			self.invStatus = invExisting.inventory_status

		self.newBalance =  flt(current_qty) + flt(self.qtyChg) if self.inOut == "IN" else flt(current_qty) - flt(self.qtyChg)

	def validator(self): 
		in_out= frappe.db.get_value("Transaction Type", self.transType, "in_out") 
		if not in_out:
			frappe.throw(
				msg=_("Transaction Type {0} belum diatur In/Out nya").format(self.transType),
				title=_("ERROR"),
				exc=frappe.ValidationError
			)
		self.inOut = in_out
 
	def create_new(self):
		self.validator()
		self.existingConsideration()
		stock_ledger = frappe.get_doc({
			"doctype": "Stock Ledger",
			"doctype_source": self.doctype,
			"inventory_doc_link": self.inventory_doc_link,
			"transaction_type": self.transType,
			"site": self.site,
			"part": self.part,
			"lot_serial": self.lotSerial,
			"warehouse_location": self.location,
			"status": self.invStatus if self.invStatus else None,
			"actual_qty": flt(self.qtyChg) if self.inOut == "IN" else -flt(self.qtyChg),
			"qty_after_transaction": flt(self.newBalance),
			"posting_date": self.postingDate,
			"expire_date": self.invExpire if self.invExpire else None,
			"po_number": self.poNumber,
			"po_line": self.poLine,
		}) 
		stock_ledger.insert(ignore_permissions=True)
		stock_ledger.submit()
		return {'success':True, 'doc_name':stock_ledger.name, 'message': 'Stock ledger updated'}