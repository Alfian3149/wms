# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from warehousing.warehousing.doctype.inventory.inventory import update_inventory_qty
from warehousing.warehousing.doctype.stock_ledger.stock_ledger import make_sl_entry
from frappe.model.naming import getseries
from frappe.utils import getdate

class StockMaintain(Document):
	def on_submit(self):
		if self.lotserial_automatic:
			date = getdate(self.posting_date)
			day   = date.strftime("%d")
			month = date.strftime("%m")
			year  = date.strftime("%y")

			lotserial_prefix = f"{self.part}-{day}{month}{year}"
			lotserial_running_number = getseries(lotserial_prefix, 3)
			self.lot_serial = f"{day}{month}{year}-{lotserial_running_number}"

		#result = update_inventory_qty(self.source_type, self.data_link, self.inventory_transactions, self.posting_date, self.site, self.part, self.lot_serial, self.reference, self.warehouse_location, self.quantity_change, self.status, self.expire_date, self.po_number, self.po_line)
		data = {
			"doctype":self.source_type,
			"doctype_link":self.data_link,
			"transType":self.inventory_transactions,
			"site":self.site,
			"part":self.part,
			"lotSerial":self.lot_serial,
			"location":self.warehouse_location,
			"invStatus":self.status,
			"qtyChg":self.quantity_change,
			"postingDate":self.posting_date,
			"invExpire":self.expire_date,
			"poNumber":self.po_number,
			"poLine":self.po_line,
		}
		init_sl = make_sl_entry(**data)
		result = init_sl.create_new()
		if result : 
			frappe.msgprint(f"result : {result['message']} for Part {self.part} with Lot/Serial {self.lot_serial} at Warehouse Location {self.warehouse_location} with Quantity Change {self.quantity_change}")
