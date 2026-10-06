// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on('Part Master', {
    part: function(frm) {
        if (frm.doc.part) {
            frm.set_value('part', frm.doc.part.toUpperCase());
        }
    },
    before_save: function(frm) {
        if (frm.doc.part) {
            frm.set_value('part', frm.doc.part.toUpperCase());
        }
    }
});