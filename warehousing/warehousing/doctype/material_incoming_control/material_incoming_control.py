# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _

class MaterialIncomingControl(Document):
	def validate(self):
		self.validate_duplicate_product_line()
	
	def validate_duplicate_product_line(self):
		seen_product_lines = []
		for row in self.part_group:
			if row.product_line in seen_product_lines:
				frappe.throw(_("Baris {0}: Product Line '{1}' sudah diinput sebelumnya. Data tidak boleh duplikat.").format(row.idx, row.product_line))
			if row.product_line:
				seen_product_lines.append(row.product_line)
