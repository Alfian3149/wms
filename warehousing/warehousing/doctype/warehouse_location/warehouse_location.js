// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on('Warehouse Location', {
	refresh(frm) {
		// your code here
	},
	
    before_save: function(frm) {
        if (frm.doc.total_capacity > 0) {
            if (!frm.doc.um) {
                frappe.validated = false;
                frappe.msgprint("Field UM cannot be blank");
                
            }
        }
    }
})
