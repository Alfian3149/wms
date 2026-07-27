# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import json
from frappe.utils import flt
from frappe.model.naming import getseries
class ItemRequest(Document):
    def autoname(self):
        type_codes = {
            "Material Transfer": "MTF",
            "Material Issue": "MIS",
            "Manufacture": "MFG",
            "Return Supplier": "RSP",
            "Return Rack": "RRK",
        }
        code = type_codes.get(self.purpose, "MFG")
        year = frappe.utils.nowdate()[:4][-2:] #2 digit year
        label_prefix = f"ITEM-REQUEST-{code}-{year}"
        label_running_number = getseries(label_prefix, 4)
        self.name = f"{code}{year}{label_running_number}"


    def on_update_after_submit(self):
        qty_needed = 0
        for request in self.items:
            qty_needed = flt(request.quantity_requested) - flt(request.quantity_picked) -  flt(request.fullfilled_qty) - flt(request.handovered)
        
        if self.items and qty_needed > 0:
            self.request_status = "Partially Picked"
        elif self.items and qty_needed <= 0:
            self.request_status = "Fully Picked"
        else:
            self.request_status = "Open"
    
    def validate(self):
        if not self.items:
            frappe.throw("Material Request must have at least one item in the items table.")
            return

        for item in self.items:
            if not item.target_location:
                item.target_location = self.target_location

        if self.request_status != "Fully Picked" and  self.request_status != "Completed" : 
            self.update_status_based_on_details()

    def update_status_based_on_details(self):
        if not self.items:
            self.request_status = "Open"
            return
                
        if self.request_status == "Ready To Issued" or self.request_status == "Completed" :
             return
             
        completed_handover = all(flt(d.quantity_requested) - flt(d.handovered) <= 0 for d in self.items)
        completed_picked = all(flt(d.quantity_requested) - flt(d.fullfilled_qty) <= 0 for d in self.items)


        if completed_handover:
            self.request_status = "Completed"
        else:
            if completed_picked : 
                self.request_status = "Fully Picked"
            else :
                self.request_status = "Partially Picked"

    def on_cancel(self):
        for item in self.items:
            if item.status != 'Completed' : 
                frappe.db.set_value(item.doctype, item.name, "status", "Cancelled")
                ws_task_name = frappe.db.get_list("Warehouse Task Detail", filters={'others_link': item.name}, fields={'name'})

                for name in ws_task_name:
                    frappe.db.set_value("Warehouse Task Detail", name, "status", "Cancelled")
                    """ ws_task_doc = frappe.get_doc("Warehouse Task Detail", name)
                    ws_task_doc.status = 'Cancelled' 
                    ws_task_doc.save() """

@frappe.whitelist()
def comfirming_picklist(item_request_doc, child_table, task_type, date_instruction, time, assigned_to_person=None, assigned_to_role=None, ):  
    doc = frappe.get_doc("Item Request", item_request_doc)
    if isinstance(child_table, str):
        items = json.loads(child_table)
    else:
        items = child_table
  
    new_task = frappe.new_doc("Warehouse Task")
    new_task.task_type = task_type
    new_task.reference_doctype = "Item Request"
    new_task.reference_name = doc.name
    new_task.assign_to_user = assigned_to_person
    new_task.assign_to_role = assigned_to_role
    new_task.date_instruction = date_instruction
    new_task.time_instruction = time
    
    for row in items:
        new_task.append("warehouse_task_detail", {
            "item": row.get("part"),
            "description":  row.get("description"),
            "um": row.get("um"),
            "lotserial": row.get("lot_serial"),
            "qty_label": row.get("quantity"),
            "qty_per_pallet": row.get("qty_per_pallet"),
            "amt_pallet": row.get("amt_pallet"),
            "expired_date": None,
            "status": "Pending",
            "locationsource": row.get("from_location"),
            "locationsuggestion": row.get("to_location"),
        })

    new_task.insert()

    return {"status": "success", "message": "Picklist berhasil dibuat.", "task_name": new_task.name}