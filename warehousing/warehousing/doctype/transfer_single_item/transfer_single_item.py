# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt
import frappe
from frappe.model.document import Document
from frappe import _
from warehousing.warehousing.doctype.stock_ledger.stock_ledger import make_sl_entry
from frappe.utils import getdate, nowdate, formatdate
from frappe.model.naming import getseries
class TransferSingleItem(Document):
	def autoname(self):
		date_str = nowdate()
		year_month = date_str[2:4] + date_str[5:7]
		label_prefix = f"TFS-ITEM-{year_month}-"
		label_running_number = getseries(label_prefix, 5)
		self.name = f"TFS-ITEM-{year_month}-{label_running_number}"

	def validate(self):
		if self.location_from == self.location_to: 
			frappe.throw(_("Location from should be different with location from"))
		

		if self.remarks and len(self.remarks) > 10 : 
			frappe.throw(_("Remarks only allowed 8 digits "))
		inventory = frappe.get_doc("Inventory", self.inventory_name) 
		if self.quantity > inventory.qty_on_hand : 
			frappe.throw(_("Quantity to transfer is over than stock "))

	def on_submit(self):
		effDate = str(getdate(nowdate()))
		details = []
		data = {
			"doctype":"Inventory",
			"doctype_link":self.inventory_name,
			"transType":"ISS-TR",
			"site":self.site_from,
			"part":self.part,
			"lotSerial":self.lotserial_from,
			"location":self.location_from,
			"invStatus":self.status,
			"qtyChg":self.quantity,
			"postingDate":effDate,
			"invExpire": self.expire if self.expire else None,
			"poNumber":None,
			"poLine":None
		}
		init_sl = make_sl_entry(**data)
		init_sl.create_new()

		data = {
			"doctype":"Inventory",
			"doctype_link":self.inventory_name,
			"transType":"RCT-TR",
			"site":self.site_from,
			"part":self.part,
			"lotSerial":self.lotserial_from,
			"location":self.location_to,
			"invStatus":self.status,
			"qtyChg":self.quantity,
			"postingDate":effDate,
			"invExpire": self.expire if self.expire else None,
			"poNumber":None,
			"poLine":None
		}
		init_sl = make_sl_entry(**data)
		init_sl.create_new()

		details.append({
			"ptPart":self.part,
			"qty":self.quantity,
			"effDate":effDate,
			"rmks":self.remarks,
			"siteFrom":self.site_from,
			"locFrom":self.location_from,
			"lotserFrom":self.lotserial_from,
			"lotrefFrom":"",
			"siteTo":self.site_from,
			"locTo":self.location_to,
			"lotserTo":self.lotserial_from,
			"lotrefTo":"",
			"usefrom":True,
			"useto":False,
		})
	
		job = frappe.enqueue(
			"warehousing.warehousing.api_transfer.transfer_submit_detail_task",
			details=details,
			ref_doctype="Transfer Single Item",
			doc_name=self.name,
			queue="short",       # Opsi: 'short', 'default', atau 'long'
			timeout=600,        # Durasi maksimal pengerjaan (detik)
			is_async=True,
			enqueue_after_commit=True # Menjamin job jalan SETELAH transaksi DB selesai
			)

