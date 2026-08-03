# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import json
from warehousing.warehousing.doctype.stock_ledger.stock_ledger import make_sl_entry
from frappe.utils import flt
from frappe.utils import getdate
from frappe import _

class ExternalTransaction(Document):
	def after_insert(self):
		create_stock_ledger_from_external_trans = frappe.db.get_single_value('Qad Integrations', 'create_stock_ledger_from_external_trans')
		if create_stock_ledger_from_external_trans == False:
			return
		
		payload_data = self.data
		if isinstance(payload_data, str):
			try:
				payload_data = json.loads(payload_data)
			except Exception:
				payload_data = {}

		Job = frappe.enqueue(
			"warehousing.warehousing.doctype.external_transaction.external_transaction.update_external_transaction_status",
			payload=payload_data,
			external_trans_name=self.name,
			queue="default", 
			timeout=300,
			is_async=True,
			enqueue_after_commit=True) 

@frappe.whitelist(allow_guest=True)
def receive_qad_transaction_history():
    # 1. Cek setting integrasi (Quick Validation)
    is_enabled = frappe.db.get_single_value('Qad Integrations', 'receive_transactions_from_external_trans')
    if not is_enabled:
        return {
            "status": "success", 
            "message": "Receiving transactions from external transaction is disabled."
        }

    # 2. Cek & parse raw data
    raw_data = frappe.request.data
    if not raw_data:
        frappe.throw(_("No data received"))

    try:
        payload = json.loads(raw_data)
    except json.JSONDecodeError:
        frappe.throw(_("Invalid JSON format"))

    ext_trans_id = payload.get("ext_trans_id")

    # 3. Cek duplikasi transaksi
    if frappe.db.exists("External Transaction", {"ext_trans_id": ext_trans_id}):
        return {
            "status": "success", 
            "message": "Transaction number already exist."
        }

    # 4. Lempar ke Background Job (Enqueue)
    # Ganti 'your_app' dengan nama aplikasi/module Anda yang sesuai
    frappe.enqueue(
        method="warehousing.warehousing.doctype.external_transaction.external_transaction.process_external_transaction",
        queue="default",  # Pilihan queue: 'short', 'default', atau 'long'
        timeout=300,
        payload=payload
    )

    # 5. Langsung kembalikan respon sukses ke client (Response time < 100ms)
    return {
        "status": "success", 
        "message": "Transaction received and queued for processing."
    }

def process_external_transaction(payload):
    """
    Fungsi ini berjalan secara asinkron di Background Job (RQ Worker).
    """
    ext_trans_id = payload.get("ext_trans_id")
    
    # 1. Double check duplikasi
    if frappe.db.exists("External Transaction", {"ext_trans_id": ext_trans_id}):
        return

    try:
        # Konversi payload dict menjadi string JSON agar aman disimpan ke DB
        data_str = json.dumps(payload) if isinstance(payload, dict) else payload

        external_transaction = frappe.get_doc({
            "doctype": "External Transaction",
            "ext_trans_id": ext_trans_id,
            "description": payload.get("description"),
            "event_type": payload.get("event_type"),
            "url": payload.get("url"),
            "data": data_str,  # <--- SUDAH DIREVISI (Harus berupa string JSON)
            "status": "Completed"
        })
        
        external_transaction.insert(ignore_permissions=True)
        frappe.db.commit()  # Simpan transaksi ke DB

    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(
            title=_("QAD Integration Error"),
            message=f"Payload: {payload}\n\nTraceback:\n{frappe.get_traceback()}"
        )

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
		qty_chg = flt(payload.get("tr_qty_chg")) or flt(payload.get("tr_qty_loc")) or 0
		data = {
			"doctype_source":"External Transaction",
			"data_link":external_trans_name,
			"transType":payload.get("tr_type"),
			"site":payload.get("tr_site"),
			"part":payload.get("tr_part"),
			"lotSerial":payload.get("tr_serial"),
			"location":payload.get("tr_loc"),
			"invStatus": inv_status if inv_status else None,
			"qtyChg":qty_chg,
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