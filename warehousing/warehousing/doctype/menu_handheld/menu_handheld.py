# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class MenuHandheld(Document):
	pass


@frappe.whitelist()
def get_allowed_handheld_menu():
    user_roles = frappe.get_roles(frappe.session.user)
    menus = frappe.get_all("Menu Handheld", fields=["name as id", "title", "description", "icon", "color", "sorting"], filters={"is_active": 1}, order_by="sorting asc")
    
    allowed_items = []
    for m in menus:
        roles_data = frappe.get_all("Menu Handheld Roles Access",
            filters={"parent": m.id},
            fields=["roles"], 
            pluck='roles'
        )

        has_access = any(role in user_roles for role in roles_data)
        if has_access:
            allowed_items.append(m)
            
    return allowed_items