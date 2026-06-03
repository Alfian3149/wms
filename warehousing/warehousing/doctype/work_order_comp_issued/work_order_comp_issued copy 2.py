# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from warehousing.warehousing.api_comp_issued import component_issued_API
from warehousing.warehousing.doctype.stock_ledger.stock_ledger import make_sl_entry
from frappe.utils import getdate, nowdate, formatdate
import json
from frappe.utils import flt
import time 
from frappe import _
class WorkOrderCompIssued(Document):   
    def on_submit(self):
        if self.for_material_packaging__blending == "Packaging" or  self.for_material_packaging__blending == "Blending" :
            status = component_issued_API(self.name)
            if status.get("status") == "failed" : 
                frappe.throw(_("Gagal mengirim data ke QAD atau terjadi kesalahan: {0}").format(status.get("message")))
            else:
                if self.mts_number:
                    frappe.db.set_value("Work Order Split", self.mts_number, {"status": "Completed"})
                    frappe.db.set_value("Work Order Split Detail", {"parent": self.mts_number}, {"is_closed": 1}, update_modified=False)
                
                    #work_order_split_doc = frappe.get_doc("Work Order Split", self.work_order_split_number)
                for item in self.item_issued:
                    data = {
                        "doctype":"Work Order Comp Issued Items",
                        "doctype_link":item.name,
                        "transType":"ISS-WO",
                        "site":"1000",
                        "part":item.part,
                        "lotSerial":item.lot_serial,
                        "location":item.from_location,
                        "qtyChg":item.quantity,
                        "postingDate":getdate(nowdate()),
                        "poNumber":None,
                        "poLine":None
                    }
                    init_sl = make_sl_entry(**data)
                    init_sl.create_new()
                frappe.db.commit()

    """ def before_submit(self):
        details_issued = {}
        
        # 1. Kumpulkan data total quantity per part
        for item_issued in self.item_issued:
            key = item_issued.part
            if key not in details_issued:
                details_issued[key] = {"total_quantity": 0}
            details_issued[key]["total_quantity"] += item_issued.quantity

        # 2. Validasi jika tidak ada item yang di-issue sama sekali
        if not details_issued: 
            frappe.throw(_("No items have been issued. Please check your entries."))

        # 3. Bandingkan dengan kebutuhan (summary)
        for item_summary in self.item_summary_to_issued:
            key = item_summary.part

            # Gunakan .get() untuk menghindari KeyError jika key tidak ditemukan
            issued_data = details_issued.get(key)

            if issued_data:
                total_qty = issued_data["total_quantity"]
                qty_needed = item_summary.qty_needed
                
                if total_qty < qty_needed:
                    # Menggunakan f-string atau .format() yang benar untuk pesan error
                    frappe.throw(
                        _("Material stock for {0} is not enough. Issued: {1}, Required: {2}")
                        .format(key, total_qty, qty_needed)
                    )
            else:   
                # Jika part yang diminta di summary tidak ada di details_issued
                frappe.throw(_("Material stock for {0} was not found in the issued list").format(key))     """        

    def validate(self):
        if self.for_material_packaging__blending == "Packaging" and self.qty_product_completed_to_be_issued <= 0:
            frappe.throw(_("Qty Product Completed To be Issued must be greater than 0 for Packaging"))

@frappe.whitelist() 
def get_lotserial_issue_details(work_order_split_number):
    work_order_split = frappe.get_doc("Work Order Split", work_order_split_number)
    destination_location = work_order_split.shopfloor_location

    list_of_details = [] 
    task_detail_map = {}
    for item in work_order_split.work_order_split_detail:
        if item.actual_required <= 0:
            continue
        getInventory = frappe.db.get_list("Inventory", filters={"part": item.part, "warehouse_location": destination_location, "qty_on_hand": [">", 0], "inventory_status": "P-GOOD"},fields=['part', 'qty_on_hand', 'lot_serial', 'warehouse_location'], order_by='lot_serial asc')

        qty_required = item.actual_required
        for inventory in getInventory:
            if qty_required <= 0:
                break
            has_handovered = frappe.db.get_all("Warehouse Task Detail", filters={"parent": ["like", "%TASK-PICK%"],"item": inventory.part, "lotserial": inventory.lot_serial, "locationdestination": inventory.warehouse_location, "status": "Completed"}, fields=["has_handovered"], order_by="creation desc", limit=1)

            if has_handovered and has_handovered[0].has_handovered: 
                qty_will_issued = min(qty_required, inventory.qty_on_hand)
                list_of_details.append({
                    "item": inventory.part,
                    "um": item.um,
                    "description": item.description,
                    "lotserial": inventory.lot_serial,
                    "item_group":   item.item_group if item.item_group else frappe.db.get_value("Part Master", inventory.part, "item_group"),
                    "quantity": qty_will_issued,
                    "location": inventory.warehouse_location,
                    "has_weighinged": 0,
                    "has_blendinged": 0,
                })
                qty_required -= qty_will_issued
                            
                key = (inventory.part)
                if key not in task_detail_map:
                    task_detail_map[key] = {
                        "quantity": 0,
                    }
                task_detail_map[key]["quantity"] += qty_will_issued

    work_order_split_detail = []
    for d in work_order_split.work_order_split_detail:
        key = (d.part)
        work_order_split_detail.append({
            "part": d.part,
            "description": d.description,
            "um": d.um,
            "qty_required": d.qty_required,
            "qty_issued": d.qty_issued,
            "actual_required": d.actual_required,
            "qty_confirm": d.qty_confirm,
            "qty_fulfilled":  task_detail_map[key]["quantity"] if key in task_detail_map else 0,
        })


    return {"details": list_of_details, "work_order_split": work_order_split_detail}

@frappe.whitelist()  
def search_and_reserve_stock(site, summary_items, item_status):
    time.sleep(2)  # Simulate processing time
    if isinstance(summary_items, str):
        summary_items = json.loads(summary_items)
    reserved_items = []
    for row in summary_items:
        part = row.get("part")
        description = row.get("description")
        item_group = row.get("item_group")
    
        qty_needed = flt(row.get("qty_needed")) 
        stocks = frappe.db.sql(f"""
            SELECT 
                inv.site, inv.part, inv.um, inv.warehouse_location, inv.lot_serial, inv.qty_on_hand, inv.qty_reserverd, inv.expire_date, inv.conversion_factor, inv.um_packaging, inv.qty_per_pallet
            FROM 
                `tabInventory` inv
            JOIN 
                `tabWarehouse Location` loc ON inv.warehouse_location = loc.name
            WHERE 
                inv.site = %s 
                AND inv.part = %s 
                AND inv.inventory_status = %s
                AND (inv.expire_date > %s OR inv.expire_date IS NULL OR inv.expire_date = '')
                AND inv.qty_on_hand > 0
                AND loc.is_active = 1
                AND loc.can_reserved_for_wo_comp_issued = 1 
            ORDER BY 
                IFNULL(inv.expire_date, '9999-12-31') ASC,
                inv.lot_serial ASC
        """, (site, part, item_status, frappe.utils.nowdate()), as_dict=True)

        for stock_oh in stocks:
            if qty_needed <= 0:
                break
            #total_not_handovered_yet = frappe.db.get_list("Lot Serial Handover Yet", {"part": stock_oh.part}, ["SUM(quantity) as qty"])

            total_not_handovered_yet = frappe.db.get_list("Warehouse Task Detail", {"part":stock_oh.part, "lotserial":stock_oh.lot_serial, "locationdestination":stock_oh.warehouse_location, "has_handovered": 0}, ["SUM(qty_confirmation) as qty"])

            available_qty = flt(stock_oh.qty_on_hand) - flt(stock_oh.qty_reserverd) 
            available_qty -= flt(total_not_handovered_yet[0].qty if total_not_handovered_yet and total_not_handovered_yet[0].qty else 0)

            if available_qty <= 0:
                continue

            take_qty = min(qty_needed, available_qty)

            reserved_items.append({
                #"site": stock_oh.site,
                "part": stock_oh.part,
                "um": stock_oh.um,
                "description": description,
                "item_group": item_group,
                "quantity": take_qty,
                "from_location": stock_oh.warehouse_location,
                "lot_serial": stock_oh.lot_serial,
            })

            qty_needed -= take_qty
    
    return reserved_items

@frappe.whitelist() 
def get_inventory_clean_for_production(site, item, lotserial, status, qty_needed): 
    notOk = False
    message = ""
    clean_iventory = []
    stocks = frappe.db.sql(f"""
            SELECT 
                inv.name, inv.site, inv.part, inv.warehouse_location, inv.lot_serial, inv.qty_on_hand, inv.qty_reserverd, inv.expire_date, inv.conversion_factor, inv.um_packaging, inv.qty_per_pallet
            FROM 
                `tabInventory` inv
            JOIN 
                `tabWarehouse Location` loc ON inv.warehouse_location = loc.name
            WHERE 
                inv.site = %s 
                AND inv.part = %s 
                AND inv.lot_serial = %s
                AND inv.inventory_status = %s
                AND (inv.expire_date > %s OR inv.expire_date IS NULL OR inv.expire_date = '')
                AND inv.qty_on_hand > 0
                AND loc.is_active = 1
                AND loc.can_reserved_for_wo_comp_issued = 1 
            ORDER BY 
                IFNULL(inv.expire_date, '9999-12-31') ASC,
                inv.lot_serial ASC
    """, (site, item, lotserial, status, frappe.utils.nowdate()), as_dict=True)

    for row in stocks:
        available = flt(row.qty_on_hand) - flt(row.qty_reserverd)
        #not_handover_yet = frappe.db.get_list("Lot Serial Handover Yet", {"site": site, "part": row.part, "lotserial": row.lot_serial}, ["SUM(qty_on_hand) as qty"])

        total_not_handovered_yet = frappe.db.get_list("Warehouse Task Detail", {"part":row.part, "lotserial":row.lot_serial, "locationdestination":row.warehouse_location, "has_handovered": 0}, ["SUM(qty_confirmation) as qty"])

        if total_not_handovered_yet:
            available -=  flt(total_not_handovered_yet[0].qty)

        if available > 0 :
            #qty_reserved = flt(row.qty_reserverd) + flt(qty_needed)
            #frappe.db.set_value('Inventory', row.name, 'qty_reserverd', min(qty_reserved, flt(row.qty_on_hand))  )
            clean_iventory.append(row)

    if not clean_iventory: 
        notOk = True
        message = "Not found available stock"

    return {
        "notOk": notOk,
        "message": message,
        "inventory":clean_iventory
    }