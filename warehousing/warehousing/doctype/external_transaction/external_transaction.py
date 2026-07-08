# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import json

class ExternalTransaction(Document):
	pass

@frappe.whitelist(allow_guest=True)
def receive_qad_transaction_history():
	raw_data = frappe.request.data
	if not raw_data:
		frappe.throw(_("No data received"))
	payload = json.loads(raw_data)
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
		return {"status": "success", "message": f"name : {External_Transaction.name}"}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), _("QAD Integration Error"))
		return {"status": "failed", "error": str(e)}