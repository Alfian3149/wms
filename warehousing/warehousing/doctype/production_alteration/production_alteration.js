// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Production Alteration", {
    refresh(frm) {
        frm.set_query('weighing_proses_number', function() {
            return {
                filters: {
                    'docstatus':['=', '1'],
                    'production_activity_to_be_carried_out':['=', 'Weighing'],
                    'is_closed':['=', false],
                }
            };
        });
    },

    weighing_proses_number(frm) {
        frm.scroll_to_field('new_work_order_number');
    }
});
