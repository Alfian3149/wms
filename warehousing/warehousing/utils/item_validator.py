import frappe
from frappe import _


class ItemValidator:
    def __init__(self, items):
        self.item = items

    def is_exist(self):
        if not frappe.db.exists("Part Master", self.item) :
            frappe.throw(_(self.item + " does not exist"), frappe.ValidationError)
            return

    def item_not_active(self):
        status = frappe.db.get_value("Part Master", self.item, "item_status")
        status_doc = frappe.db.get_value("Part Status Master", status, "is_active")
        if not status_doc:
            frappe.throw(_("Item status is not active"),frappe.ValidationError)
            return

    def putaway_method_not_setup_yet(self):
        drawing_loc = frappe.db.get_value("Part Master", self.item, "drawing_location")
        if not drawing_loc:
            frappe.throw(f"Part Master {self.item} tidak memiliki Drawing Location", frappe.ValidationError)

    def expire_date_required(self):
        expire_required = frappe.db.get_value("Part Master", self.item, "expire_date_required")
        return expire_required