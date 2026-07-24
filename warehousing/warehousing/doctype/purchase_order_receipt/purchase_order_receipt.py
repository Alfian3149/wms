# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from warehousing.warehousing.utils.connection import get_url
from frappe.utils import flt
from frappe.model.naming import make_autoname

class PurchaseOrderReceipt(Document):
	def autoname(self):
		year = frappe.utils.nowdate()[:4]
		self.name = make_autoname(f"POR-{year}-.#####")

	def before_insert(self):
		for row in self.purchase_order_receipt_item:
			if not row.location_to_receive:
				row.location_to_receive = self.location_receipt

	def validate(self):
		all_zero = all(d.qty_to_receive == 0 for d in self.purchase_order_receipt_item)

		if all_zero :
			frappe.msgprint('All rows is zero qty to receive. Please fill qty to receive at least one row.', 'Error', 'red');
			return;

	def on_submit(self):
		if self.receiver : 
			frappe.msgprint('This transaction has been receipt.', 'Error', 'red');
			return;

		url = get_url()
		data = test_internal_api(url)

		for item in self.purchase_order_receipt_item : 
			if item.qty_to_receive == 0 : 
				continue
			line_no = item.po_line

			if line_no not in grouped_details:
				# Inisialisasi record ttPOTransDet jika line baru ditemukan
				grouped_details[line_no] = {
					"nbr": self.purchase_order,
					"line": line_no,
					"site": self.site,
					"loc": item.location_to_receive,
					"lotSer": item.lot_serial,
					"ref": item.reference,
					"qty": 0, # Akan dijumlahkan dari semua lot
					"expire": item.expire,
					"rctstat": item.itm_rcpt_status,
					"ttPOInventoryTransDet": []
				}

			grouped_details[line_no]["qty"] += item.qty_to_receive

		final_payload = {
            "dsPOTrans": {
                "ttPOTrans": [{
                    "nbr": self.purchase_order,
                    "psNbr": self.name,
                    "effDate": self.transaction_date,
                    "moveToNextOp": True,
                    "lcorrection": False,
                    "shipDate": self.ship_date,
                    "rcpDate": self.receipt_date,
                    "ttPOTransDet": list(grouped_details.values()) # Masukkan hasil grouping
                }]
            }
        }



		data = frappe.as_json(final_payload)
		payload = f"""<?xml version="1.0" encoding="utf-8"?>
		<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
		<soap:Body>
			<zzPoReceiptAPI xmlns="urn:services-qad-com:smiiwsa:0001:smiiwsa">
			<ipdataset_dsPOTrans>{data}</ipdataset_dsPOTrans>
			</zzPoReceiptAPI>
		</soap:Body>
		</soap:Envelope>"""
		headers = {
		'Content-Type': 'text/xml; charset=utf-8',
		'SOAPAction': '""'
		}
		receiver = None
		isNotOk = "false"
		errorMsg = ""
		
		int_log = frappe.get_doc({
		"doctype": "Integration Request",
		"integration_request_service": "PO Receipt Non-Material",
		"url": url,
		"data": json.dumps(payload, indent=4) if isinstance(payload, (dict, list)) else payload,
		"status": "Queued",
		"reference_doctype": "Warehouse Task",
		"reference_name": parent_doc_name
		})
		int_log.insert(ignore_permissions=True)
		frappe.db.commit()

		try:
			response = requests.request("POST", url, data=payload, headers=headers, timeout=300)
			int_log.output = response.text
			if response.status_code == 200:
				root = ET.fromstring(response.text)
				namespaces = {'qad': 'urn:services-qad-com:smiiwsa:0001:smiiwsa'}
				
				oplc_element = root.find('.//qad:oplcdataset', namespaces)
				opnotok_element = root.find('.//qad:opnotok', namespaces)
				operror_element = root.find('.//qad:operror', namespaces)
				errmessage_element = root.find('.//qad:errmessage', namespaces)

				if opnotok_element is not None:
					isNotOk = opnotok_element.text.strip().lower()
					errorMsg = operror_element.text if operror_element is not None else "Unknown Error"
					
					if isNotOk == "true":
						int_log.status = "Failed"
						error_temp = []
						if errmessage_element is not None and errmessage_element.text:
							try:
								err_data = json.loads(errmessage_element.text)
								error_temp = err_data.get("temp_err_msg", [])
							except:
								error_temp = errmessage_element.text

						log_data = {
							"request_payload": payload,
							"error_message": error_temp,
							"qad_error_msg": errorMsg
						}
						
						frappe.log_error(
							title=f"ERROR: Purchase Order Receipt {self.name}",
							message=json.dumps(log_data, indent=4)
						)

						frappe.throw((errorMsg))
						
		except Exception as e:
			frappe.db.rollback()
			int_log.status = "Failed"
			int_log.error_log = frappe.get_traceback()
			int_log.save(ignore_permissions=True)
			frappe.db.commit()
			frappe.throw(_("Terjadi kesalahan saat menghubungi QAD: {0}").format(str(e)))