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

class PurchaseOrderReturn(Document):
	def autoname(self):
		year = frappe.utils.nowdate()[:4]
		prefix =  f"PO.RETURN-{year}"
		self.name = f"{prefix}-{getseries(prefix, 5)}" 

	def before_submit(self):
		url = get_url()
		data = test_internal_api(url)
		year = frappe.utils.nowdate()[2:4]
		receiver = None
		receiver = make_autoname(f"RN{year}.####")

		grouped_details = {}
		for item in self.return_item_serials : 
			if item.qty_to_return == 0 : 
				continue
			line_no = item.po_line

			if line_no not in grouped_details:
				grouped_details[line_no] = {
					"operation": "A",
					"poNbr": self.purchase_order,
					"podLine": line_no,
					"site": item.site,
					"location": item.current_location,
					"lotSerial": item.lot_serial,
					"reference": "",
					"lotSerialQty": 0, # Akan dijumlahkan dari semua lot
					"multientry" : True,
					"ordercomments": False,
					"Reopen" : True,
					"ttPurchaseOrderReturnLineSerials": []
				}
			

			grouped_details[line_no]["lotSerialQty"] += item.qty_to_return
			
			# Tambahkan record lot ke dalam array ttPurchaseOrderReturnLineSerials
			grouped_details[line_no]["ttPurchaseOrderReturnLineSerials"].append({
				"operation": "A",
				"poNbr": self.purchase_order,
				"podLine": line_no,
				"location": item.current_location,
				"lotSerial": item.lot_serial,
				"reference": "",
				"lotSerialQty": item.qty_to_return,
			})

		final_payload = {
			"dsPurchaseOrderReturn": {
				"ttPurchaseOrderReturn": [{
					"operation": "A",
					"poNbr": self.purchase_order,
					"receiverNbr": receiver,
					"effDate": self.eff_date,
					"fillAll": False,
					"returnAll": False,
					"comments": False,
					"moveToNextOperation": True,
					"returnToReplace": False,
					"Reopen": False,
					"ttPurchaseOrderReturnLine": list(grouped_details.values()) # Masukkan hasil grouping
				}]
			}
		}

		data = frappe.as_json(final_payload)
		#print(data)

		payload = f"""<?xml version="1.0" encoding="utf-8"?>
		<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
		<soap:Body>
			<zzPoReturn xmlns="urn:services-qad-com:smiiwsa:0001:smiiwsa">
			<ipdataset>{data}</ipdataset>
			</zzPoReturn>
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
			"integration_request_service": "PO Return",
			"url": url,
			"data": json.dumps(payload, indent=4) if isinstance(payload, (dict, list)) else payload,
			"status": "Queued",
			"reference_doctype": "Purchase Order Return",
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
							title=f"ERROR: Purchase Order Return {self.name}",
							message=json.dumps(log_data, indent=4)
						)
						raise Exception(errorMsg)
						
					else: 
						self.receiver = receiver
						int_log.status = "Completed"
						
						frappe.msgprint(
							msg="PO Return QAD succesfully with Receiver : " + receiver,
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


@frappe.whitelist()
def getPoReceiptLineItemSerials(purchase_order, line):
	STOCK_LEDGER = frappe.db.get_list("Stock Ledger", 
	filters={'transaction_type':'RCT-PO', 'po_number': purchase_order, 'po_line': line}, 
	fields=['site','part','lot_serial', 'actual_qty','data_link'])

	data = []

	for row in STOCK_LEDGER:
		trhist = frappe.db.get_value("External Transaction", row.data_link, "data")
		payload = json.loads(frappe.as_json(trhist)) if isinstance(trhist, dict) else json.loads(trhist)
		receiver = payload.get("tr_lot") #receiver
		STOCK = frappe.db.get_list("Inventory", filters={'site': row.site, 'part': row.part, 'lot_serial': row.lot_serial, 'qty_on_hand': ['>', 0]}, fields=['site', 'part', 'lot_serial', 'qty_on_hand', 'inventory_status', 'expire_date', 'warehouse_location'])
		if STOCK : 
			# 2. Ambil dictionary pertama dari hasil query
			stock_item = STOCK[0]
			
			# 3. Tambahkan key 'receiver' ke dalam dictionary tersebut
			stock_item['receiver'] = receiver

			data.append(stock_item)

	if not data : 
		return {'status': 'failed'}

	return {'status': 'success', 'message': data}