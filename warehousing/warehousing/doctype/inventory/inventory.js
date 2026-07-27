// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Inventory", {
	refresh(frm) {
		//frm.set_value("barcode_value", frm.doc.part + "#" + frm.doc.lot_serial);
		frm.set_value("id_barcode", frm.doc.part + "#" + frm.doc.lot_serial);
        //frm.disable_save();
 	},
});
