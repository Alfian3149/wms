# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe


def execute(filters=None):
	columns = get_columns()
	data = get_data(filters)

	return columns, data

def get_columns():
	"""Mendefinisikan Header Kolom Tabel"""
	return [
		{
			"label": "Request",
			"fieldname": "item_request",
			"fieldtype": "Link",
			"options": "Item Request",
			"width": 120
		},
		{
			"label": "Creation",
			"fieldname": "creation",
			"fieldtype": "Datetime",
			"width": 170
		},

		{
			"label": "Requestor",
			"fieldname": "owner",
			"fieldtype": "Data",
			"width": 110
		},
		{
			"label": "Item",
			"fieldname": "part",
			"fieldtype": "Link",
			"options": "Part Master",
			"width": 100
		},
		{
			"label": "Group",
			"fieldname": "item_group",
			"fieldtype": "Data",
			"width": 100
		},
		{
			"label": "Prd Line",
			"fieldname": "prd_line",
			"fieldtype": "Data",
			"width": 80
		},
		{
			"label": "Requested",
			"fieldname": "quantity_requested",
			"fieldtype": "Float",
			"width": 120
		},
		{
			"label": "Reserved",
			"fieldname": "quantity_picked",
			"fieldtype": "Float",
			"width": 120
		},
		{
			"label": "Fullfilled",
			"fieldname": "fullfilled_qty",
			"fieldtype": "Float",
			"width": 120
		},
		{
			"label": "Handovered",
			"fieldname": "handovered",
			"fieldtype": "Float",
			"width": 120
		},
		{
			"label": "Status",
			"fieldname": "status",
			"fieldtype": "Data",
			"width": 100
		}
	]

def get_data(filters):
    conditions = []
    values = {}

    # 1. Filter Date
    if filters.get("from_date") and filters.get("to_date"):
        conditions.append("parent.posting_date BETWEEN %(from_date)s AND %(to_date)s")
        values["from_date"] = filters.get("from_date")
        values["to_date"] = filters.get("to_date")

    # 2. Filter Document Name
    if filters.get("name"):
        conditions.append("parent.name LIKE %(name)s")
        values["name"] = f"%{filters.get('name')}%"

    # 3. Filter Part
    if filters.get("part"):
        conditions.append("detail.part LIKE %(part)s")
        values["part"] = f"%{filters.get('part')}%"

    # 4. Filter Status (Termasuk penanganan khusus "Blank")
    status_filter = filters.get("status")
    if status_filter == "Blank":
        conditions.append("(detail.status IS NULL OR detail.status = '')")
    elif status_filter:
        conditions.append("detail.status = %(status)s")
        values["status"] = status_filter

    # Build WHERE Clause
    where_clause = ""
    if conditions:
        where_clause = "AND " + " AND ".join(conditions)

    # 5. Build Query
    query = f"""
        SELECT 
            parent.name AS item_request,
            parent.docstatus,
            parent.owner,
            parent.creation,
            detail.part,
            detail.item_group,
            detail.prd_line,
            detail.quantity_requested,
            detail.quantity_picked,
            detail.fullfilled_qty,
            detail.handovered,
            detail.status
        FROM 
            `tabItem Request Detail` detail
        JOIN 
            `tabItem Request` parent ON detail.parent = parent.name
        WHERE 
            parent.docstatus IN (1, 2)
            {where_clause}
        ORDER BY 
            detail.modified DESC
    """

    # 6. Eksekusi Query menggunakan 'values'
    return frappe.db.sql(query, values, as_dict=True)