# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt
from frappe.model.naming import make_autoname

class ItemPicklistByPart(Document):
	def autoname(self):
		year = frappe.utils.nowdate()[:4]
		self.name = make_autoname(f"PL-{year}-.#####")
	
	""" def validate(self):
		if not self.item_picklist_detail : 
			frappe.msgprint(
				msg="There is no item details found, please run get item detail",
				alert=False,
				indicator="red"
			)
			return
			 """
	def on_cancel(self):
		try:
			for selected in self.selected_item:
				if selected.quantity_picked > 0 :
					item_req_detail = frappe.db.get_value("Item Request Detail", {'name':selected.child_name}, ['quantity_picked'], as_dict=1)
					total_picked = 0
					if item_req_detail: 
						total_picked = flt(item_req_detail.quantity_picked)  + flt(-abs(selected.quantity_picked) )  

					frappe.db.set_value("Item Request Detail", selected.child_name, "quantity_picked", total_picked)

			task = frappe.db.get_value("Warehouse Task", {'reference_name':self.name}, ['name'], as_dict=1)
			if task :
				frappe.db.delete("Warehouse Task", task.name)
				frappe.db.delete("Reserved Task Entry", filters={'task': task.name})

		except Exception as e:
			frappe.log_error(frappe.get_traceback(), "Error when picklist cancelation ")
			frappe.throw(f"Gagal cancel picklist {str(e)}")
	
	
	def on_submit(self):
		try :
			for selected in self.selected_item:
				if selected.quantity_picked > 0 :
					item_req_detail = frappe.db.get_value("Item Request Detail", {'name':selected.name}, ['quantity_picked'], as_dict=1)
					total_picked = flt(selected.quantity_picked)
					if item_req_detail:
						total_picked = flt(item_req_detail.quantity_picked) + flt(selected.quantity_picked)
					
					frappe.db.set_value("Item Request Detail", selected.child_name, "quantity_picked", total_picked)

			need_handover = 1
			picklist_type = "Picking"
			if self.purpose_short == "RSP" : 
				need_handover = 0
				picklist_type = "Return"


			new_task = frappe.new_doc("Warehouse Task")
			new_task.task_type = picklist_type
			new_task.reference_doctype = "Item Picklist By Part"
			new_task.reference_name = self.name
			#new_task.source_id = ", ".join(itemRequestDoc)
			new_task.is_needed_handover = need_handover
			#new_task.wo_split_number = ", ".join(itemRequestDoc)

			new_task.date_instruction = frappe.utils.nowdate()
			new_task.time_instruction = frappe.utils.nowtime()

			for item in self.item_picklist_detail:
				child_name_list = [data.child_name for data in self.selected_item if data.part == item.part]
				new_task.append("warehouse_task_detail", {
					"item": item.part,
					"um": item.um,
					"lotserial": item.lot_serial,
					"description": item.description,
					"conversion_factor": item.conversion_factor,
					"um_packaging": item.um_conversion,
					"qty_label": item.quantity,
					"locationsource": item.from_location,
					"locationdestination": item.to_location,
					"others_link": item.demand_row_names,
				})

			new_task.insert()
				
			for item in self.item_picklist_detail:
				doc_reserved_task = frappe.get_doc({
					"doctype": "Reserved Task Entry",
					"purpose" : "Picking",
					"doctype_source" : "Warehouse Task",
					"task": new_task.name,
					"site": item.site,
					"part": item.part,
					"lot_serial": item.lot_serial,
					"warehouse_location": item.from_location,
					"destination_location": item.to_location,
					"qty": item.quantity, 
				})
				doc_reserved_task.insert(ignore_permissions=True)
		except Exception as e:
			frappe.log_error(frappe.get_traceback(), "Error when Create Warehouse Task")
			frappe.throw(f"Gagal membuat Warehouse Task: {str(e)}")

	@frappe.whitelist()
	def allocate_picked_quantities(self):
		"""
		Fungsi untuk mendistribusikan kuantitas dari 'item_picklist_detail' ke 'selected_item',
		sekaligus mengaitkan 'name' dari baris demand ke baris supply yang bersangkutan.
		"""
		# 1. Kumpulkan demand (permintaan) per Part Number
		demands = {}
		for row in self.get("selected_item"):
			row.quantity_picked = 0 
			
			#to_pick = flt(row.quantity_requested - row.has_picked)
			to_pick = flt(row.quantity_requested)
			if to_pick > 0:
				if row.part not in demands:
					demands[row.part] = []
				demands[row.part].append(row)

		# 2. Kumpulkan supply (ketersediaan stock)
		supplies = {}
		for detail in self.get("item_picklist_detail"):
			# Reset tracker referensi demand di baris supply
			detail.demand_row_names = ""  # atau [] jika menggunakan JSON
			
			qty = flt(detail.quantity)
			if qty > 0:
				if detail.part not in supplies:
					supplies[detail.part] = []
				
				supplies[detail.part].append({
					"doc_row": detail,
					"remaining_qty": qty,
					"linked_demands": []  # Penampung temporary ID demand
				})

		# 3. Proses Alokasi & Pencatatan Referensi (Matching Loop)
		for part, demand_rows in demands.items():
			if part not in supplies:
				continue
				
			supply_list = supplies[part]
			supply_index = 0
			
			for demand_row in demand_rows:
				#needed_qty = flt(demand_row.quantity_requested - demand_row.has_picked)
				needed_qty = flt(demand_row.quantity_requested)
				allocated_for_this_row = 0
				
				while needed_qty > 0 and supply_index < len(supply_list):
					current_supply = supply_list[supply_index]
					available_qty = current_supply["remaining_qty"]
					
					if available_qty <= 0:
						supply_index += 1
						continue
						
					allocated_qty = min(needed_qty, available_qty)
					
					# Update sisa stock dan kebutuhan
					current_supply["remaining_qty"] -= allocated_qty
					needed_qty -= allocated_qty
					allocated_for_this_row += allocated_qty
					
					# Catat 'name' baris demand ke supply ini (jika belum tercatat)
					if demand_row.name and demand_row.name not in current_supply["linked_demands"]:
						current_supply["linked_demands"].append(demand_row.child_name)
					
					if current_supply["remaining_qty"] <= 0:
						supply_index += 1
				
				demand_row.quantity_picked = allocated_for_this_row

		# 4. Format dan simpan ID Demand ke baris Supply
		for part, supply_list in supplies.items():
			for supply in supply_list:
				doc_row = supply["doc_row"]
				if supply["linked_demands"]:
					# Opsi A: String dipisahkan koma (Contoh: "ROW-001, ROW-002")
					doc_row.demand_row_names = ", ".join(supply["linked_demands"])
					
					# Opsi B (Alternatif): Format JSON String jika ingin diparse kembali dengan mudah di JS/Python
					# doc_row.demand_row_names = json.dumps(supply["linked_demands"])

		#self.save()
		#return True

	@frappe.whitelist()
	def get_item_request_list(self):
		if self.purpose == 'For All' :
			item_request_list = frappe.get_all(
				"Item Request",
				filters={"docstatus": 1, "request_status": ["not in", ["Fully Picked", "Ready To Issued", "Completed"]]},
				fields=["name", "required_by"],
			)
		else:
			item_request_list = frappe.get_all(
				"Item Request",
				filters={"docstatus": 1, "purpose": self.purpose, "request_status": ["not in", ["Fully Picked", "Ready To Issued", "Completed"]]},
				fields=["name", "required_by"],
			)
		response = []
		for data in item_request_list:
			req_detail_list = frappe.db.get_list("Item Request Detail", filters={"parent": data.name, "status":['!=', 'Completed']}, fields=['name'])
			for data in req_detail_list:
				doc = frappe.get_doc("Item Request Detail", data)
				qty_needed = flt(doc.quantity_requested) - (flt(doc.quantity_picked) + flt(doc.fullfilled_qty) + flt(doc.handovered))
				if qty_needed > 0:
					
					response.append({
						"parent": doc.parent,
						"child": doc.name,
						"need_date": data.required_by,
						"part": doc.part,
						"site": doc.site,
						"description": doc.description,
						"target_location": doc.target_location,
						"item_group": doc.item_group,
						"um": doc.um,
						"quantity_requested": qty_needed,
						"quantity_picked": doc.quantity_picked,
						"fullfilled": doc.fullfilled,
						"handovered": doc.handovered,
						"prd_line": doc.prd_line,
					})

		return response
