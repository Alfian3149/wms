import frappe
from frappe import _
from frappe.utils.formatters import format_value
from frappe.utils import flt
class WorkOrderValidator:
    def __init__(self, work_order):
        self.work_order = work_order
    
    def qty_tobe_produced(self, qty):
        getWO = frappe.db.get_list('Work Order Split',
        filters={'work_order':self.work_order, 'docstatus':1},
        fields=['sum(quantity_to_be_produced_immediately) as totalProduced', 'quantity_ordered', 'quantity_completed', 'um'])
        if getWO and getWO[0].totalProduced:
            totalQtyAllowed = flt(getWO[0].quantity_ordered) + flt(((getWO[0].quantity_ordered * 10) / 100))
            qtyAllowed = totalQtyAllowed - flt(getWO[0].quantity_completed)
            if totalQtyAllowed < flt(qty) + flt(getWO[0].quantity_completed): 
                frappe.throw(
                    msg=_(f"Not allowed to input qty {format_value(qty, dict(fieldtype='Float'))} . You are allowed to input qty for maximum {format_value(qtyAllowed, dict(fieldtype='Float'))} {getWO[0].um}"),
                    title=_("ERROR"),
                    exc=frappe.ValidationError)
                    
                return 
    