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
			"label": "Item Request",
			"fieldname": "item_request",
			"fieldtype": "Link",
			"options": "Item Request",
			"width": 140
		},
		{
			"label": "Tanggal",
			"fieldname": "posting_date",
			"fieldtype": "Date",
			"width": 110
		},
		{
			"label": "Item Code",
			"fieldname": "part",
			"fieldtype": "Link",
			"options": "Part Master",
			"width": 140
		},
		{
			"label": "Group",
			"fieldname": "item_group",
			"fieldtype": "Data",
			"width": 140
		},
		{
			"label": "Requested",
			"fieldname": "quantity_requested",
			"fieldtype": "Float",
			"width": 100
		},
		{
			"label": "Reserved",
			"fieldname": "quantity_picked",
			"fieldtype": "Float",
			"width": 100
		},
		{
			"label": "Fullfilled",
			"fieldname": "fullfilled_qty",
			"fieldtype": "Float",
			"width": 100
		},
		{
			"label": "Handovered",
			"fieldname": "handovered",
			"fieldtype": "Float",
			"width": 100
		},
		{
			"label": "Status",
			"fieldname": "status",
			"fieldtype": "Data",
			"width": 120
		}
	]

def get_data(filters):
	"""Menarik data dari database menggunakan SQLQuery berdasarkan Filter"""
	conditions = []
	values = {}
	if filters.get("from_date") and filters.get("to_date"):
		conditions.append("parent.posting_date BETWEEN %(from_date)s AND %(to_date)s")

	if filters.get("name"):
		conditions.append("parent.name LIKE CONCAT('%%', %(name)s, '%%')")
		

	if filters.get("status"):
		conditions.append("detail.status = %(status)s")
		
	where_clause = " AND ".join(conditions)
	if where_clause:
		where_clause = "AND " + where_clause

	query = f"""
		SELECT 
			parent.name AS item_request,
			parent.posting_date,
			detail.part,
			detail.item_group,
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
			parent.docstatus = 1
			{where_clause}
		ORDER BY 
			detail.modified DESC
	"""
	return frappe.db.sql(query, filters, as_dict=True)