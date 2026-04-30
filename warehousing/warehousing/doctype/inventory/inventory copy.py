# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt
import math
import time
class Inventory(Document):
	pass

@frappe.whitelist()
def update_inventory_qty(doctype, doctype_link, transType, postingDate, site, part, lot_serial, reference, whs_location, qty_change, invStatus=None, expireDate=None, poNumber=None, poLine=None):
    """
    Update: Menambah atau mengurangi stok berdasarkan perubahan qty
    """
    in_out= frappe.db.get_value("Transaction Type", transType, "in_out") 
    if not in_out:
        frappe.throw(
            msg=_("Transaction Type {0} belum diatur In/Out nya").format(transType),
            title=_("ERROR"),
            exc=frappe.ValidationError
        )
        frappe.throw(_("Transaction Type {0} belum diatur In/Out nya").format(transType))
    # Cari record yang sudah ada
    inventory = frappe.db.get_value("Inventory", 
        {"site": site, "part": part, "lot_serial": lot_serial, "reference": reference, "warehouse_location": whs_location}, ["name", "qty_on_hand", "inventory_status", "expire_date"], as_dict=True)

    if inventory:
        current_qty = inventory.qty_on_hand
        name = inventory.name
        in_status = inventory.inventory_status
        in_expire = inventory.expire_date
    else:
        if in_out == "OUT" : 
            frappe.throw(
                msg=_("Inventory does not exist to {0} process").format(f"{transType} {part} {lot_serial} {whs_location}"),
                title=_("ERROR"),
                exc=frappe.ValidationError
            )
        current_qty = 0
        name = None
        in_status = invStatus
        in_expire = expireDate

    new_balance =  flt(current_qty) + flt(qty_change) if in_out == "IN" else flt(current_qty) - flt(qty_change)

    # Buat Stock Ledger (Riwayat)
    stock_ledger = frappe.get_doc({
        "doctype": "Stock Ledger",
        "doctype_source": doctype,
        "data_link": doctype_link,
        "transaction_type": transType,
        "po_number": poNumber,
        "po_line": poLine,
        "site": site,
        "part": part,
        "lot_serial": lot_serial,
        "warehouse_location": whs_location,
        "expire_date": in_expire if in_expire else None,
        "status": in_status if in_status else None,
        "actual_qty": flt(qty_change) if in_out == "IN" else -flt(qty_change),
        "qty_after_transaction": flt(new_balance),
        "posting_date": postingDate,
    }) 
    stock_ledger.insert(ignore_permissions=True)
    stock_ledger.submit()
    
    if inventory:
        # UPDATE: Ambil dokumen dan tambahkan qty
        doc = frappe.get_doc("Inventory", name)
        doc.qty_on_hand = flt(new_balance)
        if in_status : 
            doc.inventory_status = in_status
        if in_expire: 
            doc.expire_date = in_expire    
        doc.save(ignore_permissions=True)
        return {'success':True, 'doc_name':doc.name, 'message': 'Inventory updated successfully'}
    else:
        # CREATE: Jika belum ada, buat record baru
        name = create_inventory_record(site, part, lot_serial, reference, whs_location, new_balance, in_status, in_expire)
        return {'success':True, 'doc_name':name, 'message': 'New inventory record created'}

    return {'success':False, 'doc_name':name, 'message': 'Failed to update inventory'}

def create_inventory_record(site, part, lot_serial, reference, whs_location, initial_qty, invStatus, expireDate=None):
    """
    Create: Membuat baris baru di tabel Inventory
    """
    conversion = frappe.db.get_value("Material Label", {'item':part, 'lotserial':lot_serial}, ['um_packaging','conversion_factor'], as_dict=1)

    new_inv = frappe.new_doc("Inventory")
    new_inv.site = site
    new_inv.part = part
    new_inv.lot_serial = lot_serial
    new_inv.reference = reference
    new_inv.warehouse_location = whs_location
    new_inv.qty_on_hand = flt(initial_qty)
    new_inv.um_packaging = conversion.um_packaging if conversion.um_packaging else None
    new_inv.conversion_factor = conversion.conversion_factor if conversion.conversion_factor else None
    if expireDate: 
        new_inv.expire_date = expireDate 
    new_inv.inventory_status = invStatus
    new_inv.insert(ignore_permissions=True)
    return new_inv.name

@frappe.whitelist()
def get_inventory_detail(site, part, lot_serial, reference, whs_location):
    """
    Read: Mengambil saldo stok saat ini
    """
    qty = frappe.db.get_value("Inventory", 
        {"site": site, "part": part, "lot_serial": lot_serial, "reference": reference, "warehouse_location": whs_location}, "qty_on_hand")
    return float(qty) if qty else 0

@frappe.whitelist() 
def get_iventory_by_item_location(item_list, in_location):
    default_site = frappe.db.get_single_value("Material Incoming Control", "default_site")
    qty_item_in = {}
    for item in item_list : 
        total_qty = frappe.db.get_value("Inventory", 
            {"site": default_site, "part":item, "warehouse_location":in_location}, 
                "sum(qty_on_hand)") or 0

        qty_item_in = {"part":item, "total_qty":total_qty}
    return qty_item_in

@frappe.whitelist()
def delete_inventory_entry(site, part, lot_serial, reference, whs_location):
    """
    Delete: Menghapus record inventory (Hati-hati dalam penggunaan)
    """
    name = frappe.db.get_value("Inventory", {"site": site, "part": part, "lot_serial": lot_serial, "reference": reference, "warehouse_location": whs_location})
    if name:
        frappe.delete_doc("Inventory", name)
  
@frappe.whitelist()
def QAD_middleware_sync(): 
    # data akan diterima sebagai string JSON
    import json
    data = frappe.request.get_json()
   
    ir = frappe.get_doc({
        "doctype": "Integration Request",
        "integration_request_service": "QAD WMS Sync",
        "status": "Completed", # "Queued", "Completed", atau "Failed"
        "data": frappe.as_json(data),     # Simpan payload JSON di sini
        "error_log": None ,
        "reference_doctype": "Inventory",
    })
    ir.insert(ignore_permissions=True)
    ir.submit() 
    frappe.db.commit() # Commit awal agar log tetap ada meski proses setelahnya error

    # Logika untuk mencatat ke Stock Ledger atau DocType khusus 'QAD Sync Log'
    # Pastikan data yang dikirim QAD lengkap (part, qty, site, trans_type, dll)
    return {"status": "success", "message": "Transaction synced"}

@frappe.whitelist(allow_guest=True)
def get_warehouse_status():
    return {"status": "Online"} 

@frappe.whitelist() 
def get_fifo_picklist_with_reserved(item_request_doc, item_status):
    default_site = frappe.db.get_single_value("Material Incoming Control", "default_site")
    doc = frappe.get_doc("Item Request", item_request_doc)
    results = []

    totals = frappe.db.get_value("Item Request Detail", 
        filters={"parent": item_request_doc}, fieldname=["sum(quantity_requested) as total_request", "sum(quantity_picked) as total_picked"], as_dict=True)  
    total_selisih = (totals.get("total_request") or 0) - (totals.get("total_picked") or 0)
    if total_selisih <= 0:
        frappe.msgprint(_("Request sudah terpenuhi semua. Tidak perlu membuat picklist."))

    time.sleep(1) # Simulasi delay untuk melihat efek real-time di UI
    for item in doc.items:
        needed_qty = flt(item.quantity_requested) - flt(item.quantity_picked)
        if needed_qty <= 0:     
            continue  # Kebutuhan sudah terpenuhi, skip ke item berikutnya
        allocated_qty = 0
        site = item.site if item.site else default_site
        total_qty_on_hand = frappe.db.get_list("Inventory", 
            {"site": site, "part": item.part, "inventory_status": item_status}, 
            ["SUM(qty_on_hand) as qty"])
        
        total_qty_reserved = frappe.db.get_list("Reserved Task Entry", 
            {"purpose":"Picking","site": site, "part": item.part}, 
            ["SUM(qty) as qty"])

        # Stok bersih yang benar-benar bisa diambil
        qty_on_hand = flt(total_qty_on_hand[0].qty) if total_qty_on_hand else 0
        qty_reserved = flt(total_qty_reserved[0].qty) if total_qty_reserved else 0
        total_available = qty_on_hand - qty_reserved

        if total_available <= 0:
            frappe.msgprint(f"Stok untuk {item.part} OH: {qty_on_hand}, Reserved: {qty_reserved} tidak tersedia (Full Reserved).")
            continue

        # 3. Cari detail Lot/Serial berdasarkan FIFO (Stock Ledger Entry)
        # Kita ambil baris yang memiliki balance_qty > 0
        stocks = frappe.db.sql(f"""
            SELECT 
                site, part, warehouse_location, lot_serial, qty_on_hand, expire_date 
            FROM 
                `tabInventory`
            WHERE 
                site = %s 
                AND part = %s 
                AND inventory_status = %s
                AND expire_date > %s
                AND qty_on_hand > 0
            ORDER BY 
                lot_serial ASC
        """, (site, item.part, item_status, frappe.utils.nowdate()), as_dict=True)

        for stock_oh in stocks:
            if allocated_qty >= needed_qty:
                break  # Kebutuhan sudah terpenuhi

            #TANPA FILTER LOKASI KARENA BARANG BISA JADI SUDAH BERPINDAH
            res_reserved = frappe.db.get_list("Reserved Task Entry", 
            {"purpose":"Picking","site": stock_oh.site, "part": stock_oh.part, "lot_serial": stock_oh.lot_serial}, 
            ["SUM(qty) as qty"])
            
            stock_reserved = flt(res_reserved[0].qty) if res_reserved else 0
            if stock_oh.qty_on_hand <= stock_reserved:
                continue  # Lot ini sudah habis di-reserve, skip ke lot berikutnya
                
            # Hitung sisa yang bisa diambil dari baris lot ini
            # Tidak boleh melebihi pool ketersediaan total (reserved logic)
            can_take_from_this_lot = flt(stock_oh.qty_on_hand) - flt(stock_reserved)    
            take_qty = min(can_take_from_this_lot, needed_qty - allocated_qty)
            
            if take_qty > 0:
                qty_per_pallet = flt(frappe.db.get_value("Part Master", stock_oh.part, "qty_per_pallet") or 1)
                if qty_per_pallet > 0:
                    qty_pallet = math.ceil(flt(take_qty) / qty_per_pallet)
                else:
                    qty_pallet = 0

                results.append({
                    "site": stock_oh.site,
                    "part": stock_oh.part,
                    "description": frappe.db.get_value("Part Master", stock_oh.part, "description"),
                    "um": frappe.db.get_value("Part Master", stock_oh.part, "um"),
                    "qty_per_pallet": qty_per_pallet,
                    "amt_pallet": qty_pallet,
                    "from_location": stock_oh.warehouse_location,
                    "to_location": item.target_location,
                    "lot_serial": stock_oh.lot_serial,
                    "qty": take_qty
                })
                allocated_qty += take_qty

    return results