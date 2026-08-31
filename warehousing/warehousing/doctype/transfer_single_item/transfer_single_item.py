# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt
import frappe
from frappe.model.document import Document
from frappe import _
from warehousing.warehousing.doctype.stock_ledger.stock_ledger import make_sl_entry
from frappe.utils import getdate, nowdate, formatdate
from frappe.model.naming import getseries
from warehousing.warehousing.utils.item_validator import ItemValidator
class TransferSingleItem(Document):
	def autoname(self):
		date_str = nowdate()
		year_month = date_str[2:4] + date_str[5:7]
		label_prefix = f"TFS-ITEM-{year_month}-"
		label_running_number = getseries(label_prefix, 5)
		self.name = f"TFS-ITEM-{year_month}-{label_running_number}"

	def validate(self):
		validator = ItemValidator(self.part)
		validator.item_not_active()
	
		if self.location_from == self.location_to: 
			frappe.throw(_("Location from should be different with location from"))
		
		if self.remarks and len(self.remarks) > 10 : 
			frappe.throw(_("MTS Number only allowed 10 digits "))
		
		if self.quantity <= 0 :
			frappe.throw(_("Quantity to transfer must be greater than 0"))
		
		if "Production" in frappe.get_roles(frappe.session.user):
			can_reserved_for_wo_comp_issued = frappe.db.get_value("Warehouse Location", self.location_from, "can_reserved_for_wo_comp_issued")
			if not can_reserved_for_wo_comp_issued:
				frappe.throw(_("You are not allowed to transfer item from this location"))

		inventory = frappe.get_doc("Inventory", self.inventory_name) 
		if self.quantity > inventory.qty_on_hand : 
			frappe.throw(_("Quantity to transfer is over than stock "))

	def on_submit(self):
		effDate = str(getdate(nowdate()))
		wsa = frappe.db.get_single_value("Qad Integrations", "url")
		
		usefrom = False
		useto = False
		if self.use_status == "usefrom" and self.quantity > 0:
			usefrom = True
		elif self.use_status == "useto" and self.quantity > 0:
			useto = True

		details = []
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
			"usefrom":usefrom,
			"useto":useto,
		})

		try :
			api_transfer = frappe.call("warehousing.warehousing.api_transfer.transfer_submit_detail_task", details=details, ref_doctype="Transfer Single Item", doc_name=self.name, wsa=wsa)
			if api_transfer.get("status") == "success":
				if self.sent_the_transfer_action_to_qc_tim:
					new_inspect = frappe.new_doc("Item Inspection")
					new_inspect.part = self.part
					new_inspect.um = self.um
					new_inspect.description = self.description
					new_inspect.lotserial = self.lotserial_from
					new_inspect.qty = self.quantity
					new_inspect.current_position = self.location_to
					new_inspect.reported_date = getdate(nowdate())
					new_inspect.reported_by = frappe.session.user
					new_inspect.reason = self.reason
					new_inspect.remarks = self.remarks_optional
					new_inspect.return_for_date = getdate(nowdate())
					new_inspect.return_location = "WH01"
					new_inspect.insert()
					new_inspect.save()

				create_stock_ledger_from_external_trans = frappe.db.get_single_value('Qad Integrations', 'create_stock_ledger_from_external_trans')
				if create_stock_ledger_from_external_trans == False:
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
			else:
				frappe.throw(_("Failed to transfer item! <br> The Error message is {0}").format(api_transfer.get("message")))
		except Exception as e:
			frappe.throw(_("Failed to transfer item! <br> The Error message is {0}").format(str(e)))
	