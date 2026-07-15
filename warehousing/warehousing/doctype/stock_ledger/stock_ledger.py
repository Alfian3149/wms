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
            'qty_on_hand': self.qty_after_transaction,
            'qty_reserved': self.reservation_after_transaction
			}
			if self.status:
				update_data['inventory_status'] = self.status

			if self.expire_date:
				update_data['expire_date'] = self.expire_date

			frappe.db.set_value('Inventory', self.inventory_doc_link, update_data)
		else: 
			create_inventory_record(self.site, self.part, self.lot_serial, None, self.warehouse_location, self.qty_after_transaction, self.status, self.expire_date, self.reservation_after_transaction)

		if self.qty_reserved: 
			if self.transaction_type == "RCT-RSV" :
				reserved = frappe.get_doc({
				"doctype": "Reserved Task Entry",
				"purpose": "Issued",
				"doctype_source": self.doctype_source,
				"task": self.data_link,
				"site": self.site,
				"part": self.part,
				"lot_serial": self.lot_serial,
				"warehouse_location": self.warehouse_location,
				"qty": self.qty_reserved,
				})
				reserved.insert(ignore_permissions=True)
				reserved.save()
			else:
				existing_reserved = frappe.db.get_value("Reserved Task Entry", {"site": self.site, "part": self.part, "lot_serial": self.lot_serial, "warehouse_location": self.warehouse_location}, ["name", "qty"],  as_dict=1) 
				if existing_reserved :
					totalReserved = flt(existing_reserved.qty) + flt(self.qty_reserved) 
					frappe.db.set_value("Reserved Task Entry", existing_reserved.name, "qty", totalReserved)
		frappe.db.commit()

class make_sl_entry:
	def __init__(self, **kwargs):
		self.doctype_source = kwargs.get("doctype_source")
		self.data_link = kwargs.get("data_link")
		self.transType = kwargs.get("transType")
		self.site = kwargs.get("site")
		self.part = kwargs.get("part")
		self.lotSerial = kwargs.get("lotSerial")
		self.location = kwargs.get("location")
		self.qtyChg = kwargs.get("qtyChg")
		self.qtyReserved = kwargs.get("qtyReserved")
		self.invStatus = kwargs.get("invStatus")
		self.invExpire = kwargs.get("invExpire")
		self.poNumber = kwargs.get("poNumber")
		self.poLine = int(kwargs.get("poLine")) if kwargs.get("poLine") else 0
		self.postingDate = kwargs.get("postingDate")
		self.inventory_doc_link = None
		self.reference = None
		self.newBalance = flt(kwargs.get("newBalance")) if kwargs.get("newBalance") else 0
		self.reservationBalance = 0
		self.inOut = None 

	def existingConsideration(self):
		""" invExisting = frappe.db.get_value("Inventory", 
        {"site": self.site, "part": self.part, "lot_serial": self.lotSerial, "warehouse_location": self.location}, ["name", "qty_on_hand", "inventory_status", "expire_date", "qty_reserved"], as_dict=True) """

		query = """
            SELECT name, qty_on_hand, inventory_status, expire_date, qty_reserved
            FROM `tabInventory`
            WHERE site = %s 
              AND part = %s 
              AND lot_serial = %s 
              AND warehouse_location = %s
            FOR UPDATE
        """

		res = frappe.db.sql(query, (self.site, self.part, self.lotSerial, self.location), as_dict=True)
		invExisting = res[0] if res else None
		current_qty = 0
		current_reservation = 0
		if invExisting : 
			current_qty = invExisting.qty_on_hand if invExisting.qty_on_hand else 0
			current_reservation = invExisting.qty_reserved if invExisting.qty_reserved else 0
			self.inventory_doc_link = invExisting.name
			self.invExpire = self.invExpire if self.invExpire else invExisting.expire_date
			self.invStatus = self.invStatus if self.invStatus else invExisting.inventory_status 

		if self.newBalance == 0 :
			self.newBalance =  flt(current_qty) + flt(self.qtyChg) 
		self.reservationBalance =  flt(current_reservation) + flt(self.qtyReserved) if self.inOut == "IN" else flt(current_reservation) - flt(self.qtyReserved)

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
			"doctype_source": self.doctype_source,
			"data_link": self.data_link,
			"inventory_doc_link": self.inventory_doc_link,
			"transaction_type": self.transType,
			"site": self.site,
			"part": self.part,
			"lot_serial": self.lotSerial,
			"warehouse_location": self.location,
			"status": self.invStatus if self.invStatus else None,
			"actual_qty": flt(self.qtyChg),
			"qty_reserved" : flt(self.qtyReserved) if self.inOut == "IN" else -flt(self.qtyReserved),
			"qty_after_transaction": flt(self.newBalance),
			"reservation_after_transaction": flt(self.reservationBalance),
			"posting_date": self.postingDate,
			"expire_date": self.invExpire if self.invExpire else None,
			"po_number": self.poNumber,
			"po_line": self.poLine,
		}) 
		stock_ledger.insert(ignore_permissions=True)
		stock_ledger.submit()
		return {'success':True, 'doc_name':stock_ledger.name, 'message': 'Stock ledger updated'}