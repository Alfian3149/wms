# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import json
import requests
from frappe.model.naming import getseries
from warehousing.warehousing.utils.connection import get_url
from warehousing.warehousing.utils.connection import test_internal_api
from frappe import _
import xml.etree.ElementTree as ET

class ReopenPO(Document):
	def autoname(self):
		year = frappe.utils.nowdate()[:4]
		prefix =  f"REOPEN.PO-{year}"
		self.name = f"{prefix}-{getseries(prefix, 4)}" 

	def before_submit(self):
		url = get_url()
		data = test_internal_api(url)
		tt_po_data = []
		for item in self.po_line_items : 
			order  = item.purchase_order

			if order not in tt_po_data:
				tt_po_data.append({
					"domain": "SMII",
					"ponbr": order,
					"podline": item.line
				})

		final_payload = {
			"dsPOInput": {
				"ttPoData": tt_po_data
			}
		}

		data = frappe.as_json(final_payload)
		payload = f"""<?xml version="1.0" encoding="utf-8"?>
		<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
		<soap:Body>
			<zzOpenLinePoStatus xmlns="urn:services-qad-com:smiiwsa:0001:smiiwsa">
			<ipPoDataset>{data}</ipPoDataset>
			</zzOpenLinePoStatus>
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
				opnotok_element = root.find('.//qad:opnotok', namespaces)
				operror_element = root.find('.//qad:operror', namespaces)
				if opnotok_element is not None:
					isNotOk = opnotok_element.text.strip().lower()
					errorMsg = operror_element.text if operror_element is not None else "Unknown Error"
					
					if isNotOk == "true":
						raise Exception(errorMsg)
		except Exception as e:
			frappe.db.rollback()
			int_log.status = "Failed"
			int_log.error_log = frappe.get_traceback()
			int_log.save(ignore_permissions=True)
			frappe.db.commit()
			frappe.throw(_("Feedback: {0}").format(str(e)))
