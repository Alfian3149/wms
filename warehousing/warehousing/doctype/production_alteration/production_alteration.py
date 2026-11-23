# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

from frappe.model.document import Document
import frappe
from frappe import _
from warehousing.warehousing.allAPI import get_workorder_from_qad 

class ProductionAlteration(Document):
	def _fetch_and_validate_wo(self):
		if not self.new_work_order_number:
			frappe.throw(_("New Work Order Number wajib diisi."))

		if not self.weighing_proses_number:
			frappe.throw(_("Weighing Proses Number wajib diisi."))

		if not frappe.db.exists("Work Order Comp Issued", self.weighing_proses_number):
			frappe.throw(
				_("Dokumen Work Order Comp Issued {0} tidak ditemukan.").format(
					self.weighing_proses_number
				)
			)

		response = get_workorder_from_qad(
			work_order=self.new_work_order_number,
			domain="SMII",
		) or {}

		ds = response.get("dsWOResponse") or {}
		womstr_list = ds.get("womstr") or []

		if not womstr_list:
			frappe.throw(
				_("Data Work Order {0} tidak ditemukan di QAD.").format(
					self.new_work_order_number
				)
			)

		mstr = womstr_list[0]
		if not mstr.get("wonbr"):
			frappe.throw(
				_("Work Order Number pada respon QAD untuk {0} tidak valid.").format(
					self.new_work_order_number
				)
			)

		# Simpan di flags (memory saja, tidak masuk DB) untuk dipakai saat on_submit
		self.flags.qad_womstr = mstr
		return mstr

	def before_submit(self):
		# Validasi ketat sebelum submit; jika gagal, submit otomatis dibatalkan
		self._fetch_and_validate_wo()

	def on_submit(self):
		mstr = self.flags.get("qad_womstr") or self._fetch_and_validate_wo()

		target_doc = frappe.get_doc("Work Order Comp Issued", self.weighing_proses_number)
		target_doc.work_order_number = mstr.get("wonbr")
		target_doc.id = mstr.get("wolot")
		target_doc.order_date = mstr.get("woord_date")
		target_doc.work_order_status = mstr.get("wostatus")
		target_doc.finish_good = mstr.get("wopart")
		target_doc.fg_description = mstr.get("wopart_desc")
		target_doc.um = mstr.get("wopart_um")
		target_doc.quantity_ordered = mstr.get("woqty_ord")
		target_doc.quantity_completed = mstr.get("woqty_comp")
		target_doc.quantity_rejected = mstr.get("woqty_rjct")

		target_doc.flags.ignore_validate_update_after_submit = True
		target_doc.save(ignore_permissions=True)
