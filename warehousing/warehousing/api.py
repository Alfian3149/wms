import frappe
from warehousing.warehousing.data_po_dummy import LIST_PO 
import time
    
def get_po_by_number(data_list, po_number):
    filtered_po = next((po for po in data_list if po.get('purchase_order').capitalize() == po_number.capitalize() ), None)
    
    return filtered_po

@frappe.whitelist() 
def getPurchaseOrder(filter_purchase_order): 
    time.sleep(1)
    purchase_order = LIST_PO
    hasil = get_po_by_number(purchase_order, filter_purchase_order)

    return hasil

@frappe.whitelist() 
def create_custom_po(doc_data):
    # doc_data akan diterima sebagai string JSON atau dictionary
    data = frappe.parse_json(doc_data)
    
    # Contoh logika: Membuat dokumen Purchase Order baru
    # atau sekadar mengembalikan pesan sukses
    return {
        "status": "success",
        "message": f"PO {data.get('purchase_order')} berhasil diproses",
        "received_items": len(data.get('line_detail', []))
    }