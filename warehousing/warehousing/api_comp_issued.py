import json
import requests
import frappe
from frappe import _
import time
from bs4 import BeautifulSoup 
from warehousing.warehousing.utils.connection import test_internal_api
import xml.etree.ElementTree as ET
from frappe.utils import getdate, nowdate, formatdate
from frappe.utils import flt

def component_issued_API(wo_comp_issued_name):
    url = "http://127.0.0.1:24079/wsa/smiiwsa"
    data = test_internal_api(url)
    if data.get("status") == "failed" : 
        return data

    wo_comp_issued_doc = frappe.get_doc("Work Order Comp Issued", wo_comp_issued_name)
    #work_order_split_doc = frappe.get_doc("Work Order Split", wo_comp_issued_doc.work_order_split_number)
    effDate = str(getdate(nowdate()))
    data = {
        "dsWOComIssueTrans": {
            "ttWorkOrderInfo": [
                {
                    "ttWoNbr": wo_comp_issued_doc.work_order_number,
                    "ttWoLot": wo_comp_issued_doc.id,
                    "ttOp": 0,
                    "ttEffDate": effDate,
                    "ttIssueAlloc": False,
                    "ttIssuePick": False,
                    "ttDocument": wo_comp_issued_name
                }
            ],
            "ttWorkOrderComp": [],
            "ttMultiEntry": []
        }
    }

    WorkOrderComp = {}
    ttMultiEntry = {}
    for d in wo_comp_issued_doc.item_issued:
        key = (d.part)
        if key not in WorkOrderComp:
            WorkOrderComp[key] = {
                "ttWoNbr": wo_comp_issued_doc.work_order_number,
                "ttWoLot": wo_comp_issued_doc.id,
                "ttPart": d.part,
                "srSite":  "1000",
                "ttQty": 0,
                "ttMultiEntryField": True
            }
        WorkOrderComp[key]["ttQty"] += flt(d.quantity)

        data["dsWOComIssueTrans"]["ttMultiEntry"].append({
            "ttWoNbr": wo_comp_issued_doc.work_order_number,
            "ttWoLot": wo_comp_issued_doc.id,
            "ttPart": d.part,
            "srSite": "1000",
            "srLoc": d.from_location,
            "srLotser": d.lot_serial,
            "srQty": flt(d.quantity),
        })
    data["dsWOComIssueTrans"]["ttWorkOrderComp"] = list(WorkOrderComp.values())


    final_payload = json.dumps(data)
    payload = f"""<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <zzWoCompIssued xmlns="urn:services-qad-com:smiiwsa:0001:smiiwsa">
        <ipdataset>{final_payload}</ipdataset>
        </zzWoCompIssued>
    </soap:Body>
    </soap:Envelope>"""
    headers = {
    'Content-Type': 'text/xml; charset=utf-8',
    'SOAPAction': '""'
    }

    # Inisialisasi variabel awal
    receiver = None
    isNotOk = "false"
    errorMsg = ""
    
    # 1. Buat Draft Integration Request untuk Logging
    int_log = frappe.get_doc({
        "doctype": "Integration Request",
        "integration_request_service": "COMPONENT ISSUED API",
        "url": url,
        "data": json.dumps(payload, indent=4) if isinstance(payload, (dict, list)) else payload,
        "status": "Queued",
        "reference_doctype": "Work Order Comp Issued",
        "reference_name": wo_comp_issued_name
    })
    int_log.insert(ignore_permissions=True)

    try:
        response = requests.request("POST", url, data=payload, headers=headers, timeout=30)
        int_log.output = response.text # Simpan respon mentah
        if response.status_code == 200:
            root = ET.fromstring(response.text)
            namespaces = {'qad': 'urn:services-qad-com:smiiwsa:0001:smiiwsa'}
            opnotok_element = root.find('.//qad:opnotok', namespaces)
            operror_element = root.find('.//qad:operror', namespaces)
            if opnotok_element is not None:
                isNotOk = opnotok_element.text.strip().lower()
                if isNotOk == "true":
                    int_log.status = "Failed"
                    int_log.save(ignore_permissions=True)
                    frappe.db.commit()
                    return {
                        "status": "failed",
                        "message": operror_element.text if operror_element is not None else "Unknown error from QAD"
                    }

                else: 
                    int_log.status = "Completed"
                    int_log.save(ignore_permissions=True)
                    frappe.db.commit()
                    return {
                        "status": "success",
                        "message": "Component issued successfully processed in QAD"
                    }

  
    except Exception as e:
        frappe.db.rollback()
        int_log.status = "Failed"
        int_log.error_log = frappe.get_traceback()
        int_log.save(ignore_permissions=True)
        #frappe.log_error(frappe.get_traceback(), "QAD Get PO API Error")
        frappe.throw(_("Terjadi kesalahan saat menghubungi QAD: {0}").format(str(e)))
        return {
            "status": "failed",
            "message": _("Terjadi kesalahan saat menghubungi QAD: {0}").format(str(e))
        }