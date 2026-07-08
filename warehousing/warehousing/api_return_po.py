import requests
import json
import frappe
from frappe import _
import time
from bs4 import BeautifulSoup 
from frappe.utils import flt
import xml.etree.ElementTree as ET
from warehousing.warehousing.utils.connection import test_internal_api
from warehousing.warehousing.utils.connection import get_url
from frappe.utils import now_datetime

@frappe.whitelist()
def po_return_confirmation(parent_doc_name):
    item_request = frappe.get_doc("Item Request", parent_doc_name)
    grouped_details = {}
    for item in item_request.items:
        line_no = item.line_order
        
        if item.quantity_requested <= 0 :
            continue

        if line_no not in grouped_details:
            # Inisialisasi record ttPOTransDet jika line baru ditemukan
            grouped_details[line_no] = {
                "nbr": item.purchase_order,
                "line": line_no,
                "site": item.site,
                "loc": item.from_location,
                "lotSer": item.lotserial,
                "ref": "",
                "qty": 0, # Akan dijumlahkan dari semua lot
                #"expire": item.expired_date,
                #"rctstat": "P-GOOD",
                "ttPOInventoryTransDet": []
            }
        
        # Tambahkan qty ke total ttPOTransDet
        grouped_details[line_no]["qty"] += flt(item.quantity_requested) * -1
        
        # Tambahkan record lot ke dalam array ttPOInventoryTransDet
        grouped_details[line_no]["ttPOInventoryTransDet"].append({
            "nbr": item.purchase_order,
            "line": line_no,
            "site": item.site,
            "loc": item.from_location,
            "lotSer": item.lotserial,
            "ref": "",
            "qty":  flt(item.quantity_requested) * -1,
            "qadc01": item.part # Sesuai mapping zzPoReceiptAPI.p
        })

    # 2. Bangun Struktur Final
    final_payload = {
        "dsPOTrans": {
            "ttPOTrans": [{
                "nbr": item_request.purchase_order,
                "psNbr": item_request.material_incoming_id,
                "effDate": item_request.posting_date,
                "moveToNextOp": True,
                "lcorrection": False,
                "shipDate": item_request.posting_date,
                "rcpDate": item_request.posting_date,
                "ttPOTransDet": list(grouped_details.values()) # Masukkan hasil grouping
            }]
        }
    }
    url = get_url()
    data = test_internal_api(url)
    
    if data.get("status") == "failed" : 
        return data

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

    int_log = frappe.get_doc({
        "doctype": "Integration Request",
        "integration_request_service": "QAD RETURN API",
        "url": url,
        "data": json.dumps(payload, indent=4) if isinstance(payload, (dict, list)) else payload,
        "status": "Queued",
        "reference_doctype": "Item Request",
        "reference_name": parent_doc_name
    })
    int_log.insert(ignore_permissions=True)
    frappe.db.commit()
    try:
        response = requests.request("POST", url, data=payload, headers=headers, timeout=300)
        int_log.output = response.text # Simpan respon mentah

        if response.status_code == 200:
            root = ET.fromstring(response.text)
            namespaces = {'qad': 'urn:services-qad-com:smiiwsa:0001:smiiwsa'}
            
            oplc_element = root.find('.//qad:oplcdataset', namespaces)
            opnotok_element = root.find('.//qad:opnotok', namespaces)
            operror_element = root.find('.//qad:operror', namespaces)
            errmessage_element = root.find('.//qad:errmessage', namespaces)

            if oplc_element is not None and oplc_element.text:
                data_dict = json.loads(oplc_element.text)
                transactionSuccess = data_dict.get("ttLotserialTrhist", [])
                isNotOk = str(data_dict.get("opnotok", "false")).lower()
                
                if isNotOk == "false":
                    frappe.enqueue(
                        "warehousing.warehousing.doctype.warehouse_task.warehouse_task.po_return_task_confirmation_in_web",
                        queue="default",
                        timeout=600,
                        is_async=True,
                        enqueue_after_commit=False,
                        transactionSuccess=transactionSuccess,
                        doctype='Item Request',
                        parent_doc_name=parent_doc_name,
                    )   

                    for d in transactionSuccess:
                        receiver = d.get("receiver")
                        break

                    int_log.status = "Completed"

            # Logika Jika Error dari QAD
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
                        title=f"ERROR: WAREHOUSE TASK {parent_doc_name}",
                        message=json.dumps(log_data, indent=4)
                    )

            frappe.db.set_value('Item Request',parent_doc_name, 'return_receiver', receiver)
            frappe.db.set_value('Item Request', parent_doc_name, 'returned_date', now_datetime())

            int_log.save(ignore_permissions=True)
            frappe.db.commit()        
            time.sleep(2) # Delay untuk memastikan data sudah terupdate sebelum dipanggil API lagi
            return {
                "receiver": receiver,
                "status": "failed" if isNotOk == "true" else "success",
                "message": errorMsg if isNotOk == "true" else None,
            }
        else:
            int_log.status = "Failed"
            int_log.save()
            return {
                "receiver": None,
                "status": "failed",
                "message": f"Koneksi ke QAD Gagal: {response.status_code}"
            }


    except Exception as e:
        frappe.db.rollback()
        int_log.status = "Failed"
        int_log.error_log = frappe.get_traceback()
        int_log.save(ignore_permissions=True)
        frappe.db.commit()
        frappe.throw(_("Terjadi kesalahan saat menghubungi QAD: {0}").format(str(e)))