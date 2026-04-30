// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Stock Maintain", {
 	refresh(frm) {
        if (frm.doc.part) {
            frappe.db.get_value("Part Master", frm.doc.part, "automatic_create_lotserial")
            .then(value => {
                if (value.message.automatic_create_lotserial) {   
                    frm.set_df_property('lotserial_automatic', 'hidden', 0);

                    if (frm.doc.lotserial_automatic) {
                        frm.set_df_property('lot_serial', 'read_only', 1);
                    } else {
                        frm.set_df_property('lot_serial', 'read_only', 0);
                    }
                }
                
            });
        }
 	},
    
    part (frm) {
        if (frm.doc.part) {
            frappe.db.get_value("Part Master", frm.doc.part, "automatic_create_lotserial")
            .then(value => {
                if (value.message.automatic_create_lotserial) {   
                    frm.set_df_property('lotserial_automatic', 'hidden', 0);
                }
            });
        }
    }, 
    lotserial_automatic(frm) {
        if (frm.doc.lotserial_automatic) {
            frm.set_df_property('lot_serial', 'read_only', 1);
        } else {
            frm.set_df_property('lot_serial', 'read_only', 0);
        }
    },
});
