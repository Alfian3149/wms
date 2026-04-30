# Copyright (c) 2025, lukubara and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document
from frappe.model.naming import getseries
from frappe.utils import getdate, nowdate
import frappe
import json
from frappe import _
import base64
import io
import pyqrcode

class MaterialLabel(Document):
    def auto_name(self):
        today = getdate(nowdate())
        month = today.strftime("%m")
        year = today.strftime("%y")

        label_prefix = f"LBL-{month}{year}-"
        label_running_number = getseries(label_prefix, 4)
        self.name = f"{month}{year}-{label_running_number}"

    def before_print(self):
        # Logika ini otomatis terpanggil saat tombol Print ditekan
        self.last_printed_on = frappe.utils.now_datetime()
        self.printed_by = frappe.session.user
        
        # Gunakan db_set agar data tersimpan tanpa memicu validasi berulang
        self.db_set("last_printed_on", self.last_printed_on)
        self.db_set("printed_by", self.printed_by)
        
        # Opsional: Beri pesan di timeline
        self.add_comment("Info", f"Label di-render untuk dicetak oleh {self.printed_by}")

@frappe.whitelist()
def sync_material_labels(data, parent_doc_name):
    import json
    items = json.loads(data)
    
    # 1. Ambil semua ID yang ada di database saat ini untuk parent ini
    # Asumsi: Ada field 'reference_parent' yang menghubungkan Label ke dokumen saat ini
    existing_labels = frappe.get_all("Material Label", 
        filters={"material_incoming_link": parent_doc_name}, 
        fields=["name"]
    )
    existing_ids = [d.name for d in existing_labels]
    
    incoming_ids = [row.get("name") for row in items if row.get("name")]
    
    # 2. DELETE: Hapus data yang ada di DB tapi tidak ada di kiriman Dialog
    ids_to_delete = [id for id in existing_ids if id not in incoming_ids]
    for doc_name in ids_to_delete:
        frappe.delete_doc("Material Label", doc_name)

    # 3. INSERT & UPDATE
    for row in items:
        if row.get("name") and row.get("name") in existing_ids:
            # UPDATE data yang sudah ada
            doc = frappe.get_doc("Material Label", row.get("name"))
            doc.line = row.get("line")
            doc.item = row.get("item")
            doc.lotserial = row.get("lotserial")
            doc.qty = row.get("qty")
            doc.barcode_fwrj = row.get("item") + "#" + row.get("lotserial"),
            doc.save()
        else:
            # INSERT data baru
            new_doc = frappe.get_doc({
                "doctype": "Material Label",
                "material_incoming_link": parent_doc_name,
                "line": row.get("line"),
                "item": row.get("item"),
                "lotserial": row.get("lotserial"),
                "qty": row.get("qty"),
                "barcode_fwrj": row.get("item") + "#" + row.get("lotserial"),
            })
            new_doc.insert()

    return {"status": "success", "message": "Sinkronisasi Berhasil"}
 
@frappe.whitelist()
def generate_bulk_print_html(docnames, doctype):
    if isinstance(docnames, str):
        docnames = json.loads(docnames)

    # Definisi mapping: "Standard Name": "Field Name di DocType"
    mapping_config = {
        "Material Label": {
            "item": "item",
            "lot": "lotserial",
            "qty": "qty"
        },
        "Inventory": {
            "item": "part", 
            "lot": "lot_serial",
            "qty": "qty_on_hand"
        }
    }

    # Ambil config sesuai doctype yang dikirim
    config = mapping_config.get(doctype)
    if not config:
        frappe.throw(_("Mapping untuk DocType {0} belum dikonfigurasi").format(doctype))

    docs_data = []
    for name in docnames:
        if frappe.db.exists(doctype, name):
            source_doc = frappe.get_doc(doctype, name)
            
            # Buat objek baru (Bunch/Dict) agar template HTML seragam
            # Ini teknik "Aliasing" agar di HTML tetap panggil {{ doc.item }}
            processed_doc = frappe._dict({
                "name": source_doc.name,
                "item": source_doc.get(config["item"]),
                "lotserial": source_doc.get(config["lot"]),
                "qty": source_doc.get(config["qty"]),
                "doctype": doctype
            })

            # Ambil data tambahan dari Part Master
            item_info = frappe.db.get_value("Part Master", processed_doc.item, ["description", "um"], as_dict=1)
            processed_doc.item_description = item_info.description if item_info else ""
            processed_doc.item_um = item_info.um if item_info else ""

            # Generate QR Code menggunakan field standar
            qr_content = f"{processed_doc.item}#{processed_doc.lotserial}"
            qr = pyqrcode.create(qr_content)
            
            buffer = io.BytesIO()
            qr.png(buffer, scale=6)
            img_str = base64.b64encode(buffer.getvalue()).decode()
            processed_doc.qr_base64 = f"data:image/png;base64,{img_str}"
            
            docs_data.append(processed_doc)

    # Update Log Cetak
    frappe.db.sql(f"update `tab{doctype}` set printed_by = %s, last_printed_on = %s where name in %s", 
                 (frappe.session.user, frappe.utils.now_datetime(), tuple(docnames)))

    return frappe.get_template("warehousing/templates/bulk_label6x1.html").render({
        "docs": docs_data
    })


def generate_bulk_print_html_copy(docnames):
    if isinstance(docnames, str):
        docnames = json.loads(docnames)

    docs_data = []
    for name in docnames:
        
        if frappe.db.exists("Material Label", name):
            doc = frappe.get_doc("Material Label", name)
            doc.item_description = frappe.db.get_value("Part Master", doc.item, "description") or ""
            doc.item_um = frappe.db.get_value("Part Master", doc.item, "um") or ""
            qr = pyqrcode.create(doc.item + "#" + doc.lotserial)
            
            buffer = io.BytesIO()
            qr.png(buffer, scale=6) # scale=6 menghasilkan resolusi yang cukup tajam

            img_str = base64.b64encode(buffer.getvalue()).decode()
            doc.qr_base64 = f"data:image/png;base64,{img_str}"
            
            docs_data.append(doc)
 
    if not docs_data:
        frappe.throw(_("No valid documents found to print"))

    frappe.db.sql("""
        update `tabMaterial Label` 
        set printed_by = %s, last_printed_on = %s 
        where name in %s
    """, (frappe.session.user, frappe.utils.now_datetime(), docnames))
 
    html_template = frappe.get_template("warehousing/templates/bulk_label.html").render({
        "docs": docs_data
    })

    return html_template