# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from warehousing.warehousing.doctype.inventory.inventory import update_inventory_qty
from frappe.utils import getdate
class WarehouseTaskDetail(Document):
	def update_transferred(self):
		default_site = frappe.db.get_single_value("Material Incoming Control", "default_site")
		if not self.executor :
			self.executor = frappe.session.user
			self.execution_time = frappe.utils.now()

		self.transferred = True
		ref = ""
		posting_date = getdate(self.execution_time)
		result = update_inventory_qty("Warehouse Task Detail", self.name, "ISS-TR", posting_date, default_site, self.item, self.lotserial, ref, self.locationsource, self.qty_confirmation, None, None, None, None)

		if (result['success']):

			#UPDATE RESERVED LOCATION AFFTED ISS-TR
			Reserved = frappe.db.get_value('Reserved Task Entry', {'purpose': 'Putaway Transfer','task': self.parent, 'warehouse_location':self.locationdestination}, ['name', 'qty'], as_dict=True)

			if Reserved:
				balancePallet = Reserved.qty - 1
				frappe.db.set_value('Reserved Task Entry', Reserved.name, 'qty', balancePallet)

			#JALANKAN RCT-TR
			getAtrribute = frappe.db.get_value('Inventory', result['doc_name'], ['inventory_status', 'expire_date'], as_dict=1)
			update_inventory_qty("Warehouse Task Detail", self.name, "RCT-TR", posting_date, default_site, self.item, self.lotserial, ref, self.locationdestination, self.qty_confirmation, getAtrribute.inventory_status, getAtrribute.expire_date, None, None)