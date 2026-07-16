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
from warehousing.warehousing.utils.connection import get_url

@frappe.whitelist()
def get_current_qad_inventory(part, bulk_insert=False):
    url = get_url()
    data = test_internal_api(url)
    if data.get("status") == "failed" : 
        return data

    
    payload = f"""<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <zzGetCurrentStock xmlns="urn:services-qad-com:smiiwsa:0001:smiiwsa">
        <ipPart>{part}</ipPart>
        </zzGetCurrentStock>
    </soap:Body>
    </soap:Envelope>"""
    headers = {
    'Content-Type': 'text/xml; charset=utf-8',
    'SOAPAction': '""'
    }

    int_log = frappe.get_doc({
        "doctype": "Integration Request",
        "integration_request_service": "GET CURRENT QAD STOCK ",
        "url": url,
        "data": json.dumps(payload, indent=4) if isinstance(payload, (dict, list)) else payload,
        "status": "Queued",
    })
    int_log.insert(ignore_permissions=True)
    try:
        response = requests.request("POST", url, data=payload, headers=headers, timeout=200)
        int_log.output = response.text # Simpan respon mentah
        if response.status_code == 200:
            xml_response = response.text
            dataResponse = None
            root = ET.fromstring(xml_response)

            for result in root.iter():
                if 'opDatasetResult' in result.tag:
                    dataResponse = json.loads(result.text)

            if dataResponse is None:
                int_log.status = "Failed"
                int_log.save(ignore_permissions=True)
                frappe.db.commit()
                return {
                    "status": "failed",
                    "message": "Data Not Found in QAD"
                }
            else: 
                int_log.status = "Completed"
                int_log.save(ignore_permissions=True)
                int_log.output = dataResponse['inventory']['ttinventory']
                frappe.db.commit()
                if bulk_insert:
                    bulk_insert_inventory = {
                        "status": "success",
                        "message": dataResponse['inventory']['ttinventory']
                    }

                    frappe.enqueue(
                        "warehousing.warehousing.inventory_api.bulk_insert_inventory",
                        queue="default",
                        timeout=600,
                        is_async=True,
                        enqueue_after_commit=False,
                        data=bulk_insert_inventory,
                    )   

                else :
                    return {
                        "status": "success",
                        "message": dataResponse['inventory']['ttinventory']
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


@frappe.whitelist()
def get_inventory_detail(domain, site, location, part, lotserial, ref):
    url = get_url()
    payload = f"""<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <zzGetInventoryDet xmlns="urn:services-qad-com:smiiwsa:0001:smiiwsa">
        <ipDomain>{domain}</ipDomain>
        <ipSite>{site}</ipSite>
        <ipLocation>{location}</ipLocation>
        <ipPart>{part}</ipPart>
        <ipLotserial>{lotserial}</ipLotserial>
        <ipRef>{ref}</ipRef>
        </zzGetInventoryDet>
    </soap:Body>
    </soap:Envelope>"""
    headers = {
    'Content-Type': 'text/xml; charset=utf-8',
    'SOAPAction': '""'
    }
    try:
        response = requests.request("POST", url, data=payload, headers=headers, timeout=200)
        if response.status_code == 200:
            xml_response = response.text
            root = ET.fromstring(xml_response)
            oot = ET.fromstring(response.text)
            namespaces = {'qad': 'urn:services-qad-com:smiiwsa:0001:smiiwsa'}
            opmessage = root.find('.//qad:opmessage', namespaces)
            
            msg = ""
            for result in root.iter():
                if 'oplcdataset' in result.tag:
                    dataResponse = json.loads(result.text)
            if opmessage:     
                msg = opmessage.text.strip().lower()

            return {
                "status": "success",
                "error": msg,
                "message": dataResponse["dsInventory"]
            }
    except Exception as e:
        return {
            "status": "failed",
            "message": _("Terjadi kesalahan saat menghubungi QAD: {0}").format(str(e))
        }

def delete_inventory_existing():
    frappe.db.delete("Inventory")
    frappe.db.commit()

def bulk_insert_inventory(data):
    delete_inventory_existing()
    now = frappe.utils.now()
    inventory_list = []
    for item in data["message"]:
        part = frappe.db.get_value("Um Conversion Factor", {"parent": item['ttpart'], "default": True}, ["conversion_factor", "in_packaging_um"])

        """ inventory_list.append({
            "site": item['ttsite'],
            "part": item['ttpart'],
            "lot_serial": item['ttlot'],
            "qty_on_hand": flt(item['ttqty_oh']),
            "um": item['ttpart_um'],
            "qty_per_pallet": flt(item['ttpart_qty_per_pallet']),
            "warehouse_location": item['ttloc'],
            "inventory_status": item['ttstatus'],
            "expire_date": item['ttexpire'],
            "um_packaging": part[1] if part else None,
            "conversion_factor": part[0] if part else None,
        }) """
        inventory_list.append((
            frappe.generate_hash(length=10),
            frappe.session.user,
            now,
            now,
            item['ttsite'],
            item['ttpart'],
            item['ttlot'],
            flt(item['ttqty_oh']),
            item['ttpart_um'],
            flt(item['ttpart_qty_per_pallet']),
            item['ttprod_line'],
            item['ttloc'],
            item['ttstatus'],
            item['ttexpire'],
            part[1] if part else None,
            part[0] if part else 0,
        ))
    if inventory_list:
        frappe.db.bulk_insert("Inventory", fields=["name", "owner", "creation", "modified", "site", "part", "lot_serial", "qty_on_hand", "um", "qty_per_pallet", "prod_line", "warehouse_location", "inventory_status", "expire_date", "um_packaging", "conversion_factor"], values=inventory_list)
        frappe.db.commit()