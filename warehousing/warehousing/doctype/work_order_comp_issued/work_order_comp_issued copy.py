# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class WorkOrderCompIssued(Document):
    def on_submit(self):
        frappe.db.set_value("Work Order Split", self.work_order_split_number, {"status": "Completed"})


@frappe.whitelist() 
def get_lotserial_issue_details(work_order_split_number):
    # 1. Ambil semua name Item Request sekaligus
    item_requests = frappe.db.get_list("Item Request", 
        filters={"doctype_source": "Work Order Split", "link": work_order_split_number}, 
        fields=["name"]
    )

    if not item_requests:
        return []

    request_names = [r.name for r in item_requests]

    # 2. Ambil semua Warehouse Task yang berhubungan dengan semua request tadi (hanya 1 query)
    # Gunakan filter "in" untuk efisiensi
    warehouse_tasks = frappe.db.get_list("Warehouse Task", 
        filters={
            "wo_split_number": work_order_split_number, 
        }, 
        fields=["name"] # Kita butuh 'name' untuk ambil child table
    )

    list_of_details = []
    task_detail_map = {}
    # 3. Ambil detail dari Child Table
    for wt in warehouse_tasks:
        # Ambil data dari child table 'warehouse_task_detail' milik dokumen Warehouse Task ini
        details = frappe.get_all("Warehouse Task Detail", 
            filters={"parent": wt.name, "status": "Completed"}, 
            fields=["*"],
            order_by="item asc, lotserial asc"
        )
    
        for d in details:
            list_of_details.append({
                "item": d.item,
                "um": d.um,
                "description": d.description,
                "lotserial": d.lotserial,
                "item_group": frappe.db.get_value("Part Master", d.item, "item_group"),
                "qty_confirmation": d.qty_confirmation,
                "locationdestination": d.locationdestination,
                "has_weighinged": d.has_weighinged,
                "has_blendinged": d.has_blendinged,
            })
            
            key = (d.item)
            if key not in task_detail_map:
                task_detail_map[key] = {
                    "qty_confirmation": 0,
                }
            task_detail_map[key]["qty_confirmation"] += d.qty_confirmation

         

    work_order_split = frappe.get_doc("Work Order Split", work_order_split_number)
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
            "qty_fulfilled":  task_detail_map[key]["qty_confirmation"] if key in task_detail_map else 0,
        })


    return {"details": list_of_details, "work_order_split": work_order_split_detail}