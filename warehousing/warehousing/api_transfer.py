import json
import requests
import frappe
from frappe import _
import time
from bs4 import BeautifulSoup 
from warehousing.warehousing.utils.connection import test_internal_api
import xml.etree.ElementTree as ET
from frappe.utils import getdate, nowdate, formatdate

@frappe.whitelist()
def transfer_submit_to_qad(details):
    url = "http://127.0.0.1:24079/wsa/smiiwsa"
    data = test_internal_api(url)
    if data.get("status") == "failed" : 
        return data

    default_site = frappe.db.get_single_value("Material Incoming Control", "default_site")

    doc = frappe.get_doc("Warehouse Task", doc_name)
    
    details = []
    for data in doc.warehouse_task_detail:
        effDate = str(getdate(nowdate()))
        if data.execution_time: 
            effDate = str(getdate(data.execution_time))

        details.append({
            "ptPart":data.item,
            "qty":data.qty_confirmation,
            "effDate":effDate,
            "rmks":data.name,
            "siteFrom":default_site,
            "locFrom":data.locationsource,
            "lotserFrom":data.lotserial,
            "lotrefFrom":"",
            "siteTo":default_site,
            "locTo":data.locationdestination,
            "lotserTo":data.lotserial,
            "lotrefTo":"",
            "usefrom":True,
            "useto":False,
        })
    final_payload = {
        "dsTransLotSerial": {
            "ttTransLotSerial": details
        }
    }

    final_payload = json.dumps(final_payload)
    payload = f"""<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <zzInvTransfer xmlns="urn:services-qad-com:smiiwsa:0001:smiiwsa">
        <ipdataset>{final_payload}</ipdataset>
        </zzInvTransfer>
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
        "integration_request_service": "QAD TRANSFER API",
        "url": url,
        "data": json.dumps(payload, indent=4) if isinstance(payload, (dict, list)) else payload,
        "status": "Queued",
        "reference_doctype": "Warehouse Task",
        "reference_name": doc_name
    })
    int_log.insert(ignore_permissions=True)

    try:
        response = requests.request("POST", url, data=payload, headers=headers, timeout=30)
        int_log.output = response.text # Simpan respon mentah
        if response.status_code == 200:
            root = ET.fromstring(response.text)
            namespaces = {'qad': 'urn:services-qad-com:smiiwsa:0001:smiiwsa'}
            opnotok_element = root.find('.//qad:opnotok', namespaces)
            if opnotok_element is not None:
                isNotOk = opnotok_element.text.strip().lower()
                if isNotOk == "true":
                    int_log.status = "Failed"
                else: 
                    int_log.status = "Completed"

                int_log.save(ignore_permissions=True)
                frappe.db.commit()
    except Exception as e:
        frappe.db.rollback()
        int_log.status = "Failed"
        int_log.error_log = frappe.get_traceback()
        int_log.save(ignore_permissions=True)
        #frappe.log_error(frappe.get_traceback(), "QAD Get PO API Error")
        frappe.throw(_("Terjadi kesalahan saat menghubungi QAD: {0}").format(str(e)))

@frappe.whitelist()
def transfer_submit_detail_task(details, ref_doctype, doc_name):
    url = "http://127.0.0.1:24079/wsa/smiiwsa"
    data = test_internal_api(url)
    if data.get("status") == "failed" : 
        return data

    """ default_site = frappe.db.get_single_value("Material Incoming Control", "default_site")

    data = frappe.get_doc("Warehouse Task Detail", doc_name)
    details = []

    effDate = str(getdate(nowdate()))
    if data.execution_time: 
        effDate = str(getdate(data.execution_time))

    details.append({
        "ptPart":data.item,
        "qty":data.qty_confirmation,
        "effDate":effDate,
        "rmks":data.name,
        "siteFrom":default_site,
        "locFrom":data.locationsource,
        "lotserFrom":data.lotserial,
        "lotrefFrom":"",
        "siteTo":default_site,
        "locTo":data.locationdestination,
        "lotserTo":data.lotserial,
        "lotrefTo":"",
        "usefrom":True,
        "useto":False,
    }) """
    
    final_payload = {
        "dsTransLotSerial": {
            "ttTransLotSerial": details
        }
    }

    final_payload = json.dumps(final_payload)
    payload = f"""<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <zzInvTransfer xmlns="urn:services-qad-com:smiiwsa:0001:smiiwsa">
        <ipdataset>{final_payload}</ipdataset>
        </zzInvTransfer>
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
        "integration_request_service": "QAD TRANSFER API",
        "url": url,
        "data": json.dumps(payload, indent=4) if isinstance(payload, (dict, list)) else payload,
        "status": "Queued",
        "reference_doctype": ref_doctype,
        "reference_name": doc_name
    })
    int_log.insert(ignore_permissions=True)

    try:
        response = requests.request("POST", url, data=payload, headers=headers, timeout=30)
        int_log.output = response.text # Simpan respon mentah
        if response.status_code == 200:
            root = ET.fromstring(response.text)
            namespaces = {'qad': 'urn:services-qad-com:smiiwsa:0001:smiiwsa'}
            opnotok_element = root.find('.//qad:opnotok', namespaces)
            if opnotok_element is not None:
                isNotOk = opnotok_element.text.strip().lower()
                if isNotOk == "true":
                    int_log.status = "Failed"
                else: 
                    int_log.status = "Completed"

                int_log.save(ignore_permissions=True)
                frappe.db.commit()
    except Exception as e:
        frappe.db.rollback()
        int_log.status = "Failed"
        int_log.error_log = frappe.get_traceback()
        int_log.save(ignore_permissions=True)
        #frappe.log_error(frappe.get_traceback(), "QAD Get PO API Error")
        frappe.throw(_("Terjadi kesalahan saat menghubungi QAD: {0}").format(str(e)))