import frappe
from warehousing.warehousing.doctype.inventory.inventory import update_inventory_qty


def issued_receipt_inventory():
    doctype = "Warehouse Task"
    doctype_link = "WHTASK-VER-2026-00001"
    transType = "ISS-WO"
    effdate = frappe.utils.nowdate()
    poNumber = ""
    poLine = 0  
    site = "1000"
    part = "3414-T0613"
    lot_serial = "LOTX1234"
    reference = ""
    whs_location = "WH01"
    qty_change = 10
    invStatus = None
    expireDate = None

    print("Before adjustment:")
    update_inventory_qty(doctype, doctype_link, transType, effdate, site, part, lot_serial, reference, whs_location, qty_change, invStatus, expireDate, poNumber, poLine)    
    print("After adjustment:")      
