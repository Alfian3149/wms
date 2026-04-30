# Copyright (c) 2025, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.model.naming import getseries
from frappe.utils import getdate, nowdate
from frappe.model.mapper import get_mapped_doc
from frappe import _
from frappe.utils import flt
from warehousing.warehousing.utils.item_validator import ItemValidator
class MaterialIncoming(Document):
	def before_insert(self):
		self.status = "Draft"

	def on_trash(self):
		frappe.db.delete("Material Label", {"material_incoming_link": self.name})

	def validate(self):
		for item in self.material_incoming_item:
			if item.qty_to_receive <=0 : 
				continue
				
			validator = ItemValidator(item.item_number)
			validator.is_exist()
			validator.item_not_active()
			validator.putaway_method_not_setup_yet()
			if (validator.expire_date_required() and not item.expired_date):
				frappe.throw(_("Expired date must be filled for item " + item.item_number), frappe.ValidationError)
		#self.ensure_item_details_exist_in_master()
		#self.expire_date_check()

		if self.doc_status == 1 and self.status == "Submitted":
			self.assign_conversion_factor()
			if not self.submitted_date:
				self.submitted_date = frappe.utils.now_datetime()
				
			today = getdate(nowdate())
			day   = today.strftime("%d")
			month = today.strftime("%m")
			year  = today.strftime("%y")	 

			exists = frappe.db.exists("Material Label", {"material_incoming_link": self.name})
			if not exists:
				for d in self.material_incoming_item:
					if d.total_label > 0:
						loop_count = d.total_label
						total_qty = d.qty_to_receive
						qty_per_pallet = d.qty_per_pallet
						remaining_qty = total_qty
						for i in range(loop_count):
							lotserial_prefix = f"{d.item_number}-{day}{month}{year}"
							lotserial_running_number = getseries(lotserial_prefix, 3)
							label_prefix = f"LBL-{month}{year}-"
							label_running_number = getseries(label_prefix, 4)
							current_qty = qty_per_pallet if remaining_qty >= qty_per_pallet else remaining_qty
							frappe.get_doc({
								'doctype': 'Material Label',
								'name' : f"{month}{year}-{label_running_number}",
								'material_incoming_link': self.name,
								'custom_purchase_order': self.purchase_order,
								'line': d.pod_line,
								'item': d.item_number,
								'um': d.um,
								'um_packaging': d.um_conversion,
								'conversion_factor': d.conversion_factor,
								'expire': d.expired_date,
								'description': d.item_description,
								'lotserial': f"{day}{month}{year}-{lotserial_running_number}",
								'qty': current_qty,
								'qty_per_pallet': qty_per_pallet,
								'barcode_fwrj': d.item_number + '#' + f"{day}{month}{year}-{lotserial_running_number}",
							}).insert(ignore_permissions=True)

							remaining_qty -= current_qty
						#frappe.db.commit()
			frappe.msgprint(
				msg="Submitted successfully",
				alert=True,
				indicator="green"
			)
	def ensure_item_details_exist_in_master(self):
		for row in self.material_incoming_item:

			if not frappe.db.exists("Part Master", row.item_number):
				self.create_new_item(row)		
	 
	def create_new_item(self, row):
		new_item = frappe.get_doc({
			"doctype": "Part Master",
			"part": row.item_number,
			"um": row.um,
			"description": row.item_description,
			"qty_per_pallet": row.qty_per_pallet,
		}) 
		new_item.insert()
	
	def assign_conversion_factor(self):
		for row in self.material_incoming_item:
			if row.qty_to_receive == 0 : 
				continue
			#part_master = frappe.get_doc("Part Master", row.item_number)
			if row.conversion_factor == 0 or not row.um_conversion:
				result = frappe.db.get_value("Um Conversion Factor", {"parent": row.item_number, "default": True}, ["conversion_factor", "in_packaging_um"])
				if result:
					row.conversion_factor, row.um_conversion = result
				else:
					row.conversion_factor = 1
					row.um_conversion = row.um
					#frappe.throw("Default unit of measure conversion must be defined in Um Conversion Factor for item " + row.item_number, frappe.ValidationError)

	def validate_qty_to_receive(self):
		line_item = self.material_incoming_item
		for d in line_item:
			if d.qty_to_receive <= 0:
				frappe.throw(_("Qty to receive must be greater than 0 for item " + d.item_number), frappe.ValidationError)
				return		

@frappe.whitelist()
def max_qty_receive_allowed(order_number, order_line, name): 
	parent_names = frappe.get_all("Material Incoming", 
		filters={
			"purchase_order": order_number,
			"name": ["!=", name],
			"status":["!=", "Cancelled"]
			}, 
		pluck="name"
	)

	# 2. Cek jika parent_names kosong agar tidak error di query selanjutnya
	if not parent_names:
		incoming = []
	else:
		# 3. Ambil data child table
		incoming = frappe.get_all("Material Incoming Item",
			filters={
				"pod_line": order_line,
				"parent": ["in", parent_names]
			},
			fields=["qty_to_receive", "qty_order", "qty_received"]
		)
	return incoming
	
@frappe.whitelist()
def make_material_label(source_name, target_doc=None):
	doc = get_mapped_doc(
		"Material Incoming",
		source_name,
		{
			"Material Incoming": {
				"doctype": "Material Label",
				"field_map": {"purchase_order": "purchase_order", "lotserial": "lotserial", "qty": "qty"},
			},
		},
		target_doc,
		postprocess,
	)

	return doc

@frappe.whitelist()
def get_po_history_with_items(purchase_order, current_doc):
    # Ambil list kedatangan lain
    history = frappe.db.get_list("Material Incoming", 
        filters={
            "purchase_order": purchase_order,
            "name": ["!=", current_doc],
            #"docstatus": ["<", 2]
        },
        fields=["name", "order_date", "site", "transaction_date", "status", "modified"],
        order_by="transaction_date desc"
    )

    # Ambil semua item untuk dokumen-dokumen tersebut
    for doc in history:
        doc['items'] = frappe.db.get_all("Material Incoming Item",
            filters={"parent": doc.name, "qty_to_receive": [">", 0]  },
            fields=["pod_line", "item_number", "item_description", "qty_to_receive", "um", "expired_date"]
        )
    
    return history