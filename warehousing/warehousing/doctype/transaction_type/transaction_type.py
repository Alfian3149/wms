# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class TransactionType(Document):
	def autoname(self):
		self.name = self.transaction_type.upper()
