// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on('Item Request', {
	refresh(frm) {
        frm.set_value('required_by', frappe.datetime.get_today());
        if (!frm.doc.requestor_by){
            frm.set_value('requestor_by', frappe.session.user); 
        }
        if (!frm.doc.requestor_by){
            frm.set_value('requestor_by', frappe.session.user); 
        }
        //frm.set_df_property('status', 'read_only', 1);

        frm.trigger('reserved_material_detail');
	},

})