# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import json
from warehousing.warehousing.doctype.stock_ledger.stock_ledger import make_sl_entry
from frappe.utils import flt
from frappe.utils import getdate

class ExternalTransaction(Document):
	def after_insert(self):
		create_stock_ledger_from_external_trans = frappe.db.get_single_value('Qad Integrations', 'create_stock_ledger_from_external_trans')
		if create_stock_ledger_from_external_trans == False:
			return
		
		payload = json.loads(self.data)

		""" frappe.call("warehousing.warehousing.doctype.external_transaction.external_transaction.update_external_transaction_status", payload=payload, external_trans_name=self.name) """
		Job = frappe.enqueue(
			"warehousing.warehousing.doctype.external_transaction.external_transaction.update_external_transaction_status",
			payload=payload,
			external_trans_name=self.name,
			queue="default", 
			timeout=300,
			is_async=True,
			enqueue_after_commit=True) 

@frappe.whitelist(allow_guest=True)
def receive_qad_transaction_history():
	receive_transactions_from_external_trans = frappe.db.get_single_value('Qad Integrations', 'receive_transactions_from_external_trans')

	if receive_transactions_from_external_trans == False:
		return {"status": "success", "message": "Receiving transactions from external transaction is disabled."}

	raw_data = frappe.request.data

	if not raw_data:
		frappe.throw(_("No data received"))
	
	payload = json.loads(raw_data)

	if (frappe.db.exists({"doctype": "External Transaction", "ext_trans_id": payload.get("ext_trans_id")})):
		return {"status": "success", "message": "Transaction number already exist."}

	try : 
		External_Transaction = frappe.get_doc({
			"doctype": "External Transaction",
			"ext_trans_id": payload.get("ext_trans_id"),
			"description": payload.get("description"),
			"event_type": payload.get("event_type"),
			"url": payload.get("url"),
			"data": raw_data,
			"status": "Completed"
			})
		External_Transaction.insert(ignore_permissions=True)

		frappe.db.commit()
		return {"status": "success", "message": f"name : {External_Transaction.name}"}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), _("QAD Integration Error"))
		return {"status": "failed", "error": str(e)}

@frappe.whitelist()
def update_external_transaction_status(payload, external_trans_name):
	if payload.get("event_type") == "tr_hist" : 
		if frappe.db.exists("Part Master", payload.get("tr_part")) is None:
			new_part = frappe.new_doc("Part Master")
			new_part.part = payload.get("tr_part")
			new_part.um = 'KG'
			new_part.description = "AUTOCREATE"
			new_part.qty_per_pallet = flt(0)
			new_part.insert(ignore_permissions=True)
			frappe.db.commit()
	
		if frappe.db.exists("Transaction Type", payload.get("tr_type")) is None:
			return

		inv_status = payload.get("last_status") 
		inv_expire = payload.get("last_expire") if payload.get("last_expire") else None
		data = {
			"doctype_source":"External Transaction",
			"data_link":external_trans_name,
			"transType":payload.get("tr_type"),
			"site":payload.get("tr_site"),
			"part":payload.get("tr_part"),
			"lotSerial":payload.get("tr_serial"),
			"location":payload.get("tr_loc"),
			"invStatus": inv_status if inv_status else None,
			"qtyChg":flt(payload.get("tr_qty_chg")) if payload.get("tr_qty_chg") != "0" else flt(payload.get("tr_qty_loc")) if payload.get("tr_qty_loc") != "0" else 0,
			"postingDate":getdate(payload.get("tr_effdate")),
			"invExpire": getdate(inv_expire) if inv_expire else None,
			"poNumber":payload.get("tr_nbr"),
			"poLine":payload.get("tr_line"),
		}
		init_sl = make_sl_entry(**data)
		init_sl.create_new()

	elif payload.get("event_type") == "pt_mstr" : 
		getPart = frappe.get_doc("Part Master", payload.get("part"))
		if getPart :
			getPart.description = payload.get("description1") + " " + payload.get("description2") 
			getPart.item_status = payload.get("item_status") if payload.get("item_status") else getPart.item_status
			getPart.product_line = payload.get("product_line") if payload.get("product_line") else getPart.product_line
			getPart.item_group = payload.get("item_category") if payload.get("item_category") else getPart.item_group
			getPart.category = payload.get("item_category") if payload.get("item_category") else getPart.category
			getPart.qty_per_pallet = payload.get("qty_per_pallet") if payload.get("qty_per_pallet") else getPart.qty_per_pallet
			getPart.net_weight = payload.get("net_weight") if payload.get("net_weight") else getPart.net_weight
			getPart.save(ignore_permissions=True)