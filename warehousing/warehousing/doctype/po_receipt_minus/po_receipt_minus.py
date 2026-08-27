# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
import time
import json
import requests
from frappe import _
from warehousing.warehousing.utils.connection import get_url
from warehousing.warehousing.utils.connection import test_internal_api
from frappe.model.document import Document
import xml.etree.ElementTree as ET
from frappe.model.naming import make_autoname
from frappe.model.naming import getseries
from frappe.utils import flt

class POReceiptMinus(Document):
	def autoname(self):
		year = frappe.utils.nowdate()[:4]
		prefix =  f"POR.MINUS-{year}"
		self.name = f"{prefix}-{getseries(prefix, 5)}" 

	def before_submit(self):
		if self.receiver : 
			frappe.msgprint('This transaction has been receipt.', 'Error', 'red');
			return;

		url = get_url()
		data = test_internal_api(url)

		year = frappe.utils.nowdate()[2:4]
		receiver = None
		receiver = make_autoname(f"RM{year}.####")

		grouped_details = {}
		for item in self.receipt_minus_item_serials : 
			if item.qty_to_return == 0 : 
				continue
			line_no = item.po_line

			if line_no not in grouped_details:
				grouped_details[line_no] = {
					"nbr": self.purchase_order,
					"line": line_no,
					"site": item.site,
					"loc": item.current_location,
                    "lotSer": item.lot_serial,
                    "ref": "",
					"qty": 0, # Akan dijumlahkan dari semua lot
					"expire": item.expire,
					"ttPOInventoryTransDet": []
				}

			grouped_details[line_no]["qty"] += flt(item.qty_to_return) * -1

			grouped_details[line_no]["ttPOInventoryTransDet"].append({
				"nbr": self.purchase_order,
				"line": line_no,
				"site": item.site,
				"loc": item.current_location,
				"lotSer": item.lot_serial,
				"ref": "",
				"qty": flt(item.qty_to_return) * -1,
				"qadc01": item.part_number # Sesuai mapping zzPoReceiptAPI.p
			})

		final_payload = {
			"dsPOTrans": {
				"ttPOTrans": [{
					"nbr": self.purchase_order,
					"receiver" : receiver,
					"effDate": self.eff_date,
					"moveToNextOp": True,
					"lcorrection": False,
					"shipDate": self.eff_date,
					"rcpDate": self.eff_date,
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

		isNotOk = "false"
		errorMsg = ""
		
		int_log = frappe.get_doc({
		"doctype": "Integration Request",
		"integration_request_service": "PO Receipt Minus",
		"url": url,
		"data": json.dumps(payload, indent=4) if isinstance(payload, (dict, list)) else payload,
		"status": "Queued",
		"reference_doctype": "Purchase Order Receipt",
		"reference_name": self.name
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

						raise Exception(errorMsg)
					else: 
						self.receiver = receiver
						int_log.status = "Completed"
						
						frappe.msgprint(
							msg="PO Receipt Minus succesfully with Receiver : " + receiver,
							title="Success",
							alert=True,
							indicator="green"  
						)
					
					int_log.save(ignore_permissions=True)
					frappe.db.commit()


						
		except Exception as e:
			frappe.db.rollback()
			int_log.status = "Failed"
			int_log.error_log = frappe.get_traceback()
			int_log.save(ignore_permissions=True)
			frappe.db.commit()
			frappe.throw(_("Feedback: {0}").format(str(e)))


