# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _
import requests
import xml.etree.ElementTree as ET
from frappe.utils import flt
class PartMaster(Document):
	def before_save(self):
		conversion_factor = self.um_conversion_factor
		if conversion_factor:
			default_count = 0
			for row in conversion_factor:
				if row.default:
					default_count += 1

			if default_count > 1:
				frappe.msgprint("Only one conversion factor can be set as default.")
				return	
			elif default_count == 0:
				frappe.msgprint("Please set one conversion factor as default.")
				return
	def validate(self):
		self.part = self.part.upper()

@frappe.whitelist()
def get_item_stock_details(item_code):
    item_info = frappe.db.get_value("Part Master", item_code, 
        ["name", "description", "drawing_location", "um", "category"], 
        as_dict=1
    )
    if not item_info:
        frappe.throw(f"Item {item_code} tidak ditemukan", frappe.DoesNotExistError)
    inventory_entries = frappe.get_all("Inventory", 
        filters={"part": item_code, "qty_on_hand": [">", 0]},
        fields=["warehouse_location", "qty_on_hand","lot_serial","creation","expire_date", "site"],
        order_by="expire_date,lot_serial"
    )
    locations = []
    total_stock = 0
    for entry in inventory_entries:
        total_stock += entry.qty_on_hand
        
        rack_prefix = entry.warehouse_location.split('-')[0] if '-' in entry.warehouse_location else entry.warehouse_location[:4]
        
        locations.append({
            "rack": rack_prefix,
            "lot_serial": entry.lot_serial,
            "location": entry.warehouse_location,
            "quantity": entry.qty_on_hand,
            "creation": entry.creation,
            "expire_date": entry.expire_date
        })
    reserved_stock = frappe.db.get_all('Reserved Task Entry', filters={'purpose': "Picking",'site': entry.site,'part': item_code},fields=['SUM(qty) as total_reserved'])
    result = {
        item_info.name: {
            "sku": item_info.name,
            "name": item_info.description,
            "um": item_info.um,
            "category": item_info.category, 
            "drawing_location": item_info.drawing_location,
            "totalStock": total_stock,
            "minStock": 0,
            "locations": locations,
            "unitPrice": 0,
            "reservedStock": reserved_stock[0].total_reserved if reserved_stock else 0
        }
    }

    return result


@frappe.whitelist(allow_guest=True)
def get_qad_item_update():
    # 1. Tangkap data mentah (Raw XML)
    raw_data = frappe.request.data
    
    if not raw_data:
        frappe.throw(_("No data received"))

    try:
        # 1. Buat Draft Integration Request untuk Logging
        int_log = frappe.get_doc({
            "doctype": "Integration Request",
            "integration_request_service": "Update Item QAD",
            "url": "/api/method/warehousing.warehousing.doctype.part_master.part_master.get_qad_item_update",
            "data": raw_data,
            "status": "Queued",
        })
        int_log.insert(ignore_permissions=True)

        # 2. Simpan ke Integration Log (DocType bawaan atau Custom)
        # Jika menggunakan DocType custom 'Integration Log'
        log = frappe.get_doc({
            "doctype": "Integration Request", # Ganti dengan nama DocType log Anda
            "direction": "Inbound",
            "integration_type": "QAD QXtend",
            "status": "Queued",
            "payload": raw_data.decode('utf-8') if isinstance(raw_data, bytes) else raw_data,
            "reference_doctype": "Part Master",
            "is_remote_request": 1,
        })
        log.insert(ignore_permissions=True)
        int_log.save(ignore_permissions=True)

        # 3. Jalankan pemrosesan di Background Job agar QAD tidak menunggu
        """ frappe.enqueue(
            'warehousing.warehousing.doctype.part_master.part_master.process_qad_xml',
            log_name=log.name,
            now=frappe.flags.in_test
        ) """

        return {"status": "success", "message": "Data received and queued"}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("QAD Integration Error"))
        return {"status": "failed", "error": str(e)}

@frappe.whitelist()
def get_syncronize_part_master_to_qad():
    url = "http://127.0.0.1:24079/wsa/smiiwsa"
    domain = "SMII"
    payload = f"""<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <getitemmaster xmlns="urn:services-qad-com:smiiwsa:0001:smiiwsa">
        <ip_domain>{domain}</ip_domain>
        </getitemmaster>
    </soap:Body>
    </soap:Envelope>"""
    headers = {
    'Content-Type': 'text/xml; charset=utf-8',
    'SOAPAction': '""'
    }
    try:
        response = requests.request("POST", url, data=payload, headers=headers, timeout=30)
        if response.status_code == 200:
            root = ET.fromstring(response.text)
            namespaces = {'ns': 'urn:services-qad-com:smiiwsa:0001:smiiwsa'}
            rows = root.findall('.//ns:ttTableRow', namespaces)
            item_list = []
            total_rows = 0
            for row in rows:
                total_rows = total_rows + 1
                data = {
                    "site": row.find('ns:ttsite', namespaces).text,
                    "part": row.find('ns:ttpart', namespaces).text,
                    "um": row.find('ns:tt_um', namespaces).text,
                    "desc1": row.find('ns:ttdesc1', namespaces).text,
                    "desc2": row.find('ns:ttdesc2', namespaces).text,
                    "qtyPerPallet": row.find('ns:tt__dec01', namespaces).text,
                    "itemStatus": row.find('ns:tt_status', namespaces).text,
                    "netWeight": row.find('ns:tt_net_wt', namespaces).text,
                    "umNetWeight": row.find('ns:tt_net_wt_um', namespaces).text,
                    "prodLine": row.find('ns:tt_prod_line', namespaces).text,
                    "drawingLoc": row.find('ns:tt_drwg_loc', namespaces).text,
                    "inventoryAcct": row.find('ns:inventory_acct', namespaces).text
                }
                item_list.append(data)
                
            if item_list : 
                frappe.enqueue(
                    "warehousing.warehousing.doctype.part_master.part_master.syncronize_part_master_to_qad",
                    part_list=item_list,
                    queue="default",
                    timeout=600,
                    is_async=True,
                    enqueue_after_commit=False,
                )   
            return {'status':'success', 'total_rows':total_rows}                  
    except Exception as e:
        frappe.throw(_("Terjadi kesalahan saat menghubungi QAD: {0}").format(str(e)))
@frappe.whitelist()
def syncronize_part_master_to_qad(part_list):
    control = frappe.get_doc("Material Incoming Control")
    prodLineAllowed = [data.product_line for data in  control.part_group ]
    unique_drw_loc = list(set(item['drawingLoc'] for item in part_list))
    for drw_loc in unique_drw_loc:
        if not frappe.db.exists("Drawing Location", drw_loc):
            doc_drw_loc = frappe.get_doc({
                "doctype": "Drawing Location",
                "drawing_location": drw_loc if drw_loc else 'None'
            })
            doc_drw_loc.insert(ignore_if_duplicate=True)
    
    unique_um_code = list(set(item['um'] for item in part_list))
    for um in unique_um_code:
        if not frappe.db.exists("Unit Of Masure", um):
            doc_um = frappe.get_doc({
                "doctype": "Unit Of Masure",
                "um": um if um else 'None'
            })
            doc_um.insert(ignore_if_duplicate=True)
    

    data_master = {}
    for part in part_list : 
        if part['prodLine'] in prodLineAllowed:
            drw_loc = part['drawingLoc'] if part['drawingLoc'] else 'None'
            itemGroup = frappe.db.get_value("Material Incoming Group Items", {"product_line":part['prodLine']}, "item_group")
            if not frappe.db.exists("Part Master", part['part']):
                new_part = frappe.new_doc("Part Master")
                new_part.part = part['part']
                new_part.um = part['um']
                new_part.product_line = part['prodLine']
                new_part.item_status = part['itemStatus']
                new_part.description = f"{part['desc1']} {part['desc2']}"
                new_part.drawing_location = drw_loc
                new_part.qty_per_pallet = flt(part['qtyPerPallet'])
                new_part.item_group = itemGroup
                new_part.insert(ignore_permissions=True)
            else:
                data_master[part['part']] = {
                    "um": part['um'],
                    "product_line": part['prodLine'],
                    "item_status": part['itemStatus'],
                    "description": f"{part['desc1']} {part['desc2']}",
                    "drawing_location": drw_loc,
                    "qty_per_pallet": flt(part['qtyPerPallet']),
                    "item_group":itemGroup,
                }
    
    if data_master : 
        frappe.db.bulk_update(
            "Part Master",
            data_master,
            chunk_size=100,
            modified_by=frappe.session.user,
            update_modified=True,
            debug=False
        )
    
    frappe.db.commit() 
