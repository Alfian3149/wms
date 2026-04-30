# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

# import frappe
from pydoc import doc
from frappe.model.document import Document
import frappe
from frappe.model.naming import make_autoname
from warehousing.warehousing.specialLogic import get_multi_bin_suggestion
import copy
from frappe.utils import flt,getdate
import time
from frappe.desk.doctype.notification_log.notification_log import enqueue_create_notification
from warehousing.warehousing.doctype.inventory.inventory import update_inventory_qty
from warehousing.warehousing.doctype.stock_ledger.stock_ledger import make_sl_entry
from warehousing.warehousing.utils.connection import test_internal_api
class WarehouseTask(Document):
    def on_submit(self):
        if self.task_type == "Picking" : 
            frappe.db.delete("Reserved Task Entry", filters={'task': self.name})

        if self.task_type == "Putaway Transfer" : 
            frappe.db.delete("Reserved Task Entry", filters={'task': self.name})
            """ frappe.enqueue(
            "warehousing.warehousing.api_transfer.transfer_submit_to_qad",
            doc_name=self.name,
            queue="long",       # Opsi: 'short', 'default', atau 'long'
            timeout=600,        # Durasi maksimal pengerjaan (detik)
            is_async=True,
            enqueue_after_commit=True # Menjamin job jalan SETELAH transaksi DB selesai
            )
            #transfer = frappe.call("warehousing.warehousing.api_transfer.transfer_submit_to_qad", doc_name=self.name) """

        """ frappe.publish_realtime('desktop_notification', {
            'title': 'Warehouse Alert',
            'message': 'Ada perbedaan stok pada Task Detail!',
            'link': f'/app/warehouse-task/{self.name}'
        }, user=self.owner) """

    """  def on_submit(self):
         from frappe.desk.doctype.notification_log.notification_log import enqueue_create_notification
         enqueue_create_notification(self.owner, {
            "subject": f"Dokumen {self.name} telah disubmit",
            "document_type": self.doctype,
            "document_name": self.name,
            "from_user": self.owner, 
            "type": "Alert"
        }) """
    
    """ def after_insert(self):
        if self.task_type == "Picking":
            default_site = frappe.db.get_single_value("Material Incoming Control", "default_site")
            item_request_doc = self.reference_name
            item_request = frappe.get_doc("Item Request", item_request_doc)
            
            sorted_task_details = sorted(
                self.warehouse_task_detail, 
                key=lambda x: (x.item), 
                reverse=True
            )
            grouped_summary = {}
            for row in sorted_task_details:
                reserved_task = frappe.new_doc("Reserved Task Entry")
                reserved_task.purpose = "Picking"
                reserved_task.doctype_source = "Item Request"
                reserved_task.task = item_request_doc
                reserved_task.site = default_site
                reserved_task.part = row.item
                reserved_task.lot_serial = row.lotserial
                reserved_task.qty = row.qty_label
                reserved_task.warehouse_location = row.locationsource

                reserved_task.insert(ignore_permissions=True)

                if row.item not in grouped_summary:
                    grouped_summary[row.item] = 0
                accum_qty = flt(grouped_summary[row.item])
                grouped_summary[row.item] = accum_qty + flt(row.qty_label)

            for request in item_request.items:
                if request.part in grouped_summary:
                    prev_qty_picked = flt(request.quantity_picked)
                    request.quantity_picked = prev_qty_picked + grouped_summary[request.part]

            item_request.save()  """
            
    def autoname(self):
        # 1. Tentukan mapping kode berdasarkan task_type
        type_codes = {
            "Picking": "PICK",
            "Physical Verification": "PVER",
            "Stock Transfer": "STRF",
            "Putaway Transfer": "PTRS"
        }

        # 2. Ambil kode singkatnya, default ke 'GEN' jika tidak ditemukan
        code = type_codes.get(self.task_type, "GEN")

        # 3. Ambil tahun saat ini
        year = frappe.utils.nowdate()[:4]

        # 4. Gabungkan menjadi format Naming Series
        # Format: TASK-CODE-YYYY-#####
        # .##### akan otomatis diisi dengan nomor urut (00001, 00002, dst)
        self.name = make_autoname(f"TASK-{code}-{year}-.#####")

    def before_save(self): 
        if self.task_type == "Putaway Transfer" or self.task_type == "Picking" :
            url = "http://127.0.0.1:24079/wsa/smiiwsa"
            data = test_internal_api(url)
            if data.get("status") == "failed" :
                frappe.throw(data.get("message"))
                
            for row in self.get("warehouse_task_detail"): 
                if row.status == "Completed" and flt(row.qty_confirmation) > 0 and row.transferred == False  :
                    row.update_transferred()  
                
    def validate(self):
        self.update_status_based_on_details()
            #self.lock_document_if_completed()

    """ def on_update(self):
        for row in self.warehouse_task_detail:
            if row.status == 'Completed' and not self.has_background_job :
                self.has_background_job = True
                self.save() """

    def update_status_based_on_details(self):
        if not self.warehouse_task_detail:
            self.status = "Pending"
            return

        all_complete = all(d.status == "Completed" for d in self.warehouse_task_detail)
        
        if all_complete:
            self.status = "Completed"

    def lock_document_if_completed(self):
            """Kunci dokumen jika status sebelumnya sudah Complete"""
            # Ambil data asli dari database sebelum perubahan disimpan
            old_doc = self.get_doc_before_save()
            
            # Jika di database statusnya sudah 'Complete'
            if old_doc and old_doc.status == "Completed":
                # Izinkan hanya System Manager yang bisa melakukan bypass/edit
                if "System Manager" not in frappe.get_roles():
                    frappe.throw(
                        _("Dokumen ini sudah dikunci karena statusnya sudah Complete. "
                        "Hanya System Manager yang dapat mengubah dokumen ini."),
                        frappe.ValidationError
                    )

@frappe.whitelist()
def notify(owner) : 
    enqueue_create_notification(owner, {
    "subject": f"Dokumen {owner} telah disubmit",
    "document_type": "Warehouse Task",
    "document_name": "WHTASK-VER-2026-00010",
    "from_user": owner,
    "type": "Alert" })

    frappe.msgprint("TEST")
    return

@frappe.whitelist()
def create_physical_verification_task(source_doc, task_type, assigned_to_person=None, assigned_to_role=None):
    new_task = frappe.new_doc("Warehouse Task")
    new_task.task_type = task_type
    new_task.reference_doctype = "Material Label"
    new_task.reference_name = source_doc
    new_task.assign_to_user = assigned_to_person
    new_task.assign_to_role = assigned_to_role
    new_task.date_instruction = frappe.utils.nowdate()
    new_task.time_instruction = frappe.utils.nowtime()
    
    Material_Label = frappe.get_all("Material Label", 
		filters={ 
			"material_incoming_link": source_doc,
		},
		fields=["name","line", "item", "lotserial", "qty"],
	)

    Material_Incoming = frappe.get_doc("Material Incoming", source_doc)
    
    # Copy data Child Table secara otomatis
    for item in Material_Label:
        Material_Incoming_Item = next((d for d in Material_Incoming.material_incoming_item if d.pod_line == item.line), None)

        new_task.append("warehouse_task_detail", {
            "material_label_link": item.name,
            "line_po": item.line,
            "item": item.item, 
            "description": frappe.db.get_value("Part Master", item.item, "description"),
            "lotserial": item.lotserial,
            "qty_label": item.qty,
            "expired_date": Material_Incoming_Item.expired_date if Material_Incoming_Item else None,
            "status": "Pending",
            "locationsource": "supplier",
            "locationdestination": Material_Incoming_Item.location_to_receive if Material_Incoming_Item else None,
            "qty_per_pallet": Material_Incoming_Item.qty_per_pallet,
            "amt_pallet":Material_Incoming_Item.total_label ,
            "um": Material_Incoming_Item.um,
            "um_packaging": item.um_packaging,
            "conversion_factor": item.conversion_factor,
        })
     
    new_task.insert() # Simpan ke database
    """ if task_type == "Physical Verification":
        Material_Incoming.physical_verification_id =  new_task.name 
    elif task_type == "Putaway Transfer":
        Material_Incoming.transfer_task_id = new_task.name
    Material_Incoming.save() """
  
    return {
         "status": "success",
         "name": new_task.name,
         "message": "Warehouse Task created successfully."
    } # Kembalikan ID task untuk dibuka di UI

@frappe.whitelist()
def create_putaway_transfer_task(source_doc, task_type, assigned_to_person=None, assigned_to_role=None):
    default_site = frappe.db.get_single_value("Material Incoming Control", "default_site")

    new_task = frappe.new_doc("Warehouse Task")
    new_task.task_type = task_type
    new_task.reference_doctype = "Warehouse Task"
    new_task.reference_name = source_doc
    new_task.assign_to_user = assigned_to_person
    new_task.assign_to_role = assigned_to_role
    new_task.date_instruction = frappe.utils.nowdate()
    new_task.time_instruction = frappe.utils.nowtime()

    Warehouse_Task = frappe.get_doc("Warehouse Task", source_doc)

    sorted_task_details = sorted(
        Warehouse_Task.warehouse_task_detail, 
        key=lambda x: (x.item, x.lotserial), 
        reverse=True
    )
    grouped_summary = {}
    for td in sorted_task_details:
        if td.item not in grouped_summary:
            grouped_summary[td.item] = 0

        current_val = grouped_summary[td.item]
        grouped_summary[td.item] = current_val + 1

    item_location_map = {}
    item_location_map_copy = {}

    for item_code, total_pallet in grouped_summary.items():
        item_location_map[item_code] = location_suggestion(item_code, total_pallet, source_doc)

    item_location_map_copy = copy.deepcopy(item_location_map)

    for task_detail in sorted_task_details:
        item_code = task_detail.item

        target_location = None
        if item_location_map.get(item_code):
            current_suggestion = item_location_map[item_code][0]
            target_location = current_suggestion['location']
            current_suggestion['amt_pallet_covered'] -= 1

            if current_suggestion['amt_pallet_covered'] <= 0:
                item_location_map[item_code].pop(0)

            print(f"Assigning item {item_code} and lotserial {task_detail.lotserial} to location {target_location}. Remaining pallet for this location: {current_suggestion['amt_pallet_covered']}")
        new_task.append("warehouse_task_detail", {
            "warehouse_task_link": source_doc,
            "line_po": task_detail.line_po,
            "item": task_detail.item, 
            "description": task_detail.description,
            "lotserial": task_detail.lotserial,
            "um": frappe.db.get_value("Part Master", item_code, "um"),
            "qty_label": task_detail.qty_confirmation,
            "expired_date": task_detail.expired_date,
            "status": "Pending",
            "locationsource": task_detail.locationdestination,
            "locationsuggestion":target_location,
        })
 
    new_task.insert()
    for key, data in item_location_map_copy.items():
        if not data:
            continue
        new_reserved = frappe.new_doc("Reserved Task Entry")
        new_reserved.site = default_site
        new_reserved.purpose = "Putaway"
        new_reserved.warehouse_location = data[0]['location']
        new_reserved.doctype_source = "Warehouse Task"
        new_reserved.task = new_task.name
        new_reserved.qty = data[0]['amt_pallet_covered']
 
        new_reserved.insert() 

    return {
        "status": "success",
        "name": new_task.name,
        "message": "Warehouse Task created successfully.",
        "grouped_summary": grouped_summary
    } 

def location_suggestion(item_code, total_incoming_pallet, reference_doc=None):
    control = frappe.get_doc("Material Incoming Control")
    drawing_loc = frappe.db.get_value("Part Master", item_code, "drawing_location")
    
    # Penampung hasil split
    suggestions = []
    remaining_pallet = total_incoming_pallet

    if not drawing_loc:
        frappe.throw(f"Part Master {item_code} tidak memiliki Drawing Location")

    putaway_method = frappe.get_doc("Putaway Method", drawing_loc)
    sorted_locations = sorted(
        putaway_method.locations, 
        key=lambda x: (x.priority, x.location)
    )

    for loc in sorted_locations:
        if remaining_pallet <= 0:
            break

        # 1. Cek Mix Item (Sesuai logic Anda)
        if not control.storage_can_mix_item:
            exists = frappe.db.exists("Inventory", {
                "site": control.default_site,
                "warehouse_location": loc.location,
                "part": ["!=", item_code]
            })
            if exists:
                continue

        # 2. Hitung Kapasitas Tersedia (Free Pallet)
        reserved_entries = frappe.db.get_all('Reserved Task Entry', filters={
            'purpose': "Putaway Transfer",
            'site': control.default_site,
            'warehouse_location': loc.location
        }, fields=['SUM(qty) as total_reserved'])

        total_reserved = reserved_entries[0].total_reserved if reserved_entries and reserved_entries[0].total_reserved else 0
        free_pallet = loc.capacity - total_reserved

        # 3. Skip jika lokasi penuh
        if free_pallet <= 0:
            continue

        # 4. Tentukan berapa yang bisa masuk ke lokasi ini
        can_take = min(free_pallet, remaining_pallet)

        # 5. Cek Threshold (Optional, jika ingin minimal pengisian tertentu)
        if control.rack_availability_threshold > 0:
            free_percentage = free_pallet / total_incoming_pallet * 100
            if free_percentage < control.rack_availability_threshold:
                continue

        # 6. Catat lokasi dan jumlah pallet yang dialokasikan
        suggestions.append({
            "location": loc.location,
            "amt_pallet_covered": can_take
        })

        # 7. Kurangi sisa pallet yang belum dapat tempat
        remaining_pallet -= can_take

    return suggestions

@frappe.whitelist()
def get_warehouse_task_items(item_request_name):
    # 1. Cari semua Task yang merujuk ke Item Request tersebut
    tasks = frappe.get_all("Warehouse Task", 
        filters={"reference_name": item_request_name}, 
        fields=["name"]
    )
    
    if not tasks:
        return []

    # Ambil semua nama task dalam satu list
    task_names = [t.name for t in tasks]

    details = frappe.get_all("Warehouse Task Detail", 
        filters={
            "parent": ["in", task_names]
        },
        fields=['name', 'item', 'description', 'lotserial', 'qty_label', 'um','user_handovered', 'has_handovered', 'user_weighinged','has_weighinged','user_blendinged','has_blendinged'],
        order_by='item asc, lotserial asc'
    )
    
    return details

@frappe.whitelist()
def get_physical_verification_task(status, user):
    tasks = frappe.get_all("Warehouse Task", 
        filters={
            "task_type": "Physical Verification",
            "status": status,
        },
        fields=["name", "reference_name", "date_instruction", "time_instruction"]
    )
    for data in tasks:
        order = frappe.db.get_value("Material Incoming", data.reference_name, ["purchase_order","supplier_name", "supplier","po_duedate","or"], as_dict=True)
    data = []

    return tasks

@frappe.whitelist()
def get_outstanding_physical_verification_tasks(user):
    user_roles = frappe.get_roles(user)
    tasks = frappe.get_all("Warehouse Task", 
    filters=[
        ["task_type", "=", "Physical Verification"],
        ["status", "!=", "Completed"],
        #["or", 
        #    ["assign_to_user", "=", user],
        #    ["assign_to_role", "in", user_roles]
        #]
    ],
    fields=["name", "reference_name", "date_instruction", "time_instruction", "assign_to_role"])

    order_tasks = []
    items = []
    for data in tasks:
        order = frappe.get_doc("Material Incoming",data.reference_name)
        task_items = frappe.get_all("Warehouse Task Detail",
                filters={"parent": data.name},
                fields=["name as keyId","item as sku", "um","description as name", "lotserial as lotSerial", "qty_label as expectedQty","qty_confirmation as receivedQty", "locationsource as fromLocation","locationdestination as toLocation","verified", "discrepancy_reason as discrepancyReason"],order_by='item asc, lotserial asc')

        order_tasks.append({
            "keyId": order.name,
            "orderId": order.purchase_order,
            "supplier": order.supplier,
            "supplier_name": order.supplier_name,
            "expectedDate": order.transaction_date,
            "status": 'pending',
            "items": task_items
        })
    return order_tasks

@frappe.whitelist()
def physical_verified_item():
    time.sleep(1) 
    #data = frappe.dumps(data)
    data = frappe.request.get_json()
    if not data:
        frappe.throw("Data tidak ditemukan dalam request")
    
    doc_child = frappe.get_doc("Warehouse Task Detail", data["keyId"])
    doc_child.reload()
    doc_child.set("qty_confirmation", data["receivedQty"])
    doc_child.set("verified", data["verified"])
    doc_child.set("locationdestination", data["toLocation"])
    doc_child.set("discrepancy_reason", data["discrepancyReason"] if data["discrepancyReason"] else None)
    doc_child.set("executor", frappe.session.user)
    doc_child.set("execution_time", frappe.utils.now())
    doc_child.set("status", "Completed")
    doc_child.save(ignore_permissions=True)

    doc_parent = frappe.get_doc("Warehouse Task", doc_child.parent)
    doc_parent.set("users_picker", frappe.session.user)
    doc_parent.save(ignore_permissions=True)
    frappe.db.commit()
    latest_doc_parent = frappe.get_doc("Warehouse Task", doc_child.parent)
    if latest_doc_parent.status == "Completed" :
        latest_doc_parent.submit()
    return data
  
@frappe.whitelist()
def putaway_transfer_confirm():
    time.sleep(1)
    #data = frappe.dumps(data)
    data = frappe.request.get_json()
    if not data:
        frappe.throw("Data tidak ditemukan dalam request")
    
    doc_child = frappe.get_doc("Warehouse Task Detail", data["keyId"])
    doc_child.reload()
    doc_child.set("qty_confirmation", data["confirmQty"])
    doc_child.set("locationdestination", data["confirmLocation"])
    #doc_child.set("discrepancy_reason", data["discrepancyReason"] if data["discrepancyReason"] else None)
    doc_child.set("executor", frappe.session.user)
    doc_child.set("execution_time", frappe.utils.now())
    doc_child.set("status", "Completed")
    doc_child.save(ignore_permissions=True)

    doc_parent = frappe.get_doc("Warehouse Task", doc_child.parent)
    doc_parent.set("users_picker", frappe.session.user)
    doc_parent.save(ignore_permissions=True)
    frappe.db.commit()
    latest_doc_parent = frappe.get_doc("Warehouse Task", doc_child.parent)
    if latest_doc_parent.status == "Completed" :
        latest_doc_parent.submit()
    return data


@frappe.whitelist()
def picked_confirm():
    time.sleep(1)
    #data = frappe.dumps(data)
    data = frappe.request.get_json()
    if not data:
        frappe.throw("Data tidak ditemukan dalam request")
    
    doc_child = frappe.get_doc("Warehouse Task Detail", data["keyId"])
    doc_child.reload()
    doc_child.set("qty_confirmation", data["pickedQty"])
    doc_child.set("locationdestination", data["destinationRack"])
    #doc_child.set("discrepancy_reason", data["discrepancyReason"] if data["discrepancyReason"] else None)
    doc_child.set("executor", frappe.session.user)
    doc_child.set("execution_time", frappe.utils.now())
    doc_child.set("status", "Completed")
    doc_child.save(ignore_permissions=True)

    doc_parent = frappe.get_doc("Warehouse Task", doc_child.parent)
    doc_parent.set("users_picker", frappe.session.user)
    doc_parent.save(ignore_permissions=True)
    frappe.db.commit()
    latest_doc_parent = frappe.get_doc("Warehouse Task", doc_child.parent)
    if latest_doc_parent.status == "Completed" :
        latest_doc_parent.submit()
    return data

@frappe.whitelist()
def scan_item_putaway(item, lotserial):
    task = frappe.get_all("Warehouse Task Detail", 
    filters={
            "item": item,                 # Filter kolom Child Table
            "lotserial": lotserial,                 # Filter kolom Child Table
            "status": "Pending",
            "parent": ["in", frappe.get_all("Warehouse Task", 
                filters={"task_type": "Putaway Transfer"}, 
                pluck="name")]
            },
    fields=["name as keyId", "item as sku", "description as name", "um", "lotserial as lotSerial",  "locationsource as currentLocation", "locationsuggestion as suggestLocation", "qty_label as availableQuantity", "locationdestination as confirmLocation","qty_confirmation as confirmQty"])
    if task:
        data_stok = {}
        data_stok[item + "#" + lotserial] = task[0] 
        return data_stok
    else:
        return {'result':'failed'}
 
def po_receipt_task_confirmation_in_web(transactionSuccess, parent_doc_name):
    for d in transactionSuccess:
        d_site = d.get("site") or "1000"
        d_poline = d.get("poline"),
        data = {
			"doctype":"Warehouse Task",
			"doctype_link":parent_doc_name,
			"transType":"RCT-PO",
			"site":d_site,
			"part":d.get("part"),
			"lotSerial":d.get("lotserial"),
			"location":d.get("location"),
			"invStatus":d.get("ldstatus"),
			"qtyChg":d.get("qty"),
			"postingDate":d.get("effdate"),
			"invExpire": d.get("expire"),
			"poNumber":d.get("ponumber"),
			"poLine":d.get("poline", "0")
		}
        init_sl = make_sl_entry(**data)
        init_sl.create_new()
    frappe.db.commit()
    """ update_inventory_qty(
        "Warehouse Task", parent_doc_name, "RCT-PO", d.get("effdate"), 
        d_site, d.get("part"), d.get("lotserial"), d.get("ref"), 
        d.get("location"), d.get("qty"), d.get("ldstatus"), 
        d.get("expire"), d.get("ponumber"), int(d.get("poline", 0))
    ) """

@frappe.whitelist() 
def get_picklist_outstanding_tasks(user):
    user_roles = frappe.get_roles(user)
    tasks = frappe.get_all("Warehouse Task", 
    filters=[
        ["task_type", "=", "Picking"],
        ["status", "!=", "Completed"],
        #["or", 
        #    ["assign_to_user", "=", user],
        #    ["assign_to_role", "in", user_roles]
        #]
    ],
    fields=["name", "reference_name", "date_instruction", "time_instruction", "assign_to_role"],)

    picklistTask = []
    items = []
    for data in tasks:
        task_items = frappe.get_all("Warehouse Task Detail",
                filters={"parent": data.name, "status": ["!=", "Completed"]},
                fields=["name as keyId","item as sku", "um","description as name", "lotserial as lotSerial", "qty_label as quantity","qty_confirmation as receivedQty", "locationsource as sourceLocation","locationdestination as toLocation"],order_by='item asc, lotserial asc')

        picklist = frappe.db.get_value("Item Picklist", data.reference_name, ["priority", "needed_date"], as_dict=True) 
        picklistTask.append({
            "orderId": data.reference_name,
            "productionLine": data.reference_name,
            "priority": picklist.priority,
            "neededDate": picklist.needed_date,
            "destination" : '',
            "status": data.status,
            "items": task_items
        })
    return picklistTask

@frappe.whitelist() 
def get_handover_outstanding_tasks(user):
    user_roles = frappe.get_roles(user)
    tasks = frappe.get_all("Warehouse Task", 
    filters=[
        ["task_type", "=", "Picking"],
        ["status", "=", "Completed"],
        ["is_needed_handover", "=", 1]
        #["or", 
        #    ["assign_to_user", "=", user],
        #    ["assign_to_role", "in", user_roles]
        #]
    ],
    fields=["name", "reference_name", "date_instruction", "time_instruction", "assign_to_role", "users_picker","modified"],)

    handoverTask = []
    items = []
    for data in tasks:
        task_items = frappe.get_all("Warehouse Task Detail",
                filters={"parent": data.name, "has_handovered": 0},
                fields=["name as keyId","item as sku", "um","description as name", "lotserial as lotSerial", "qty_confirmation as quantity","locationdestination as location", "qty_handover as handedOverQty"],order_by='item asc, lotserial asc')

        picklist = frappe.db.get_value("Item Picklist", data.reference_name, ["priority", "needed_date"], as_dict=True) 
        handoverTask.append({
            "orderId": data.reference_name,
            "productionLine": "",
            "pickedBy": data.users_picker if data.users_picker else None,
            "pickedDate": getdate(data.modified)  if data.modified else None,
            "items": task_items
        })
    return handoverTask

@frappe.whitelist()
def handover_confirm():
    time.sleep(1)
    #data = frappe.dumps(data)
    dataList = frappe.request.get_json()
    if not dataList:
        frappe.throw("Data tidak ditemukan dalam request")
    
    parent = None
    for data in dataList:
        doc_child = frappe.get_doc("Warehouse Task Detail", data["keyId"])
        parent = doc_child.parent
        doc_child.reload()
        doc_child.set("qty_handover", data["quantity"])
        doc_child.set("has_handovered", 1)
        doc_child.set("user_handovered", frappe.session.user)
        doc_child.set("time_handovered", frappe.utils.now())
        doc_child.save(ignore_permissions=True)


    is_exist_handover_yet = frappe.db.exists("Warehouse Task Detail", {"parent":parent, "has_handovered":0})
    if not is_exist_handover_yet:
        doc_parent = frappe.get_doc("Warehouse Task", parent)
        doc_parent.set("is_needed_handover", 0)
        doc_parent.save(ignore_permissions=True)
    frappe.db.commit()
    return data