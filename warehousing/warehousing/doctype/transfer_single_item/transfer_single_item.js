// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Transfer Single Item", {
    onload(frm){
        if(frm.is_new()){
        frm.set_df_property('from_to', 'hidden', 1);
        }
        
    },
    refresh(frm) {
        frm.set_query('reason', function() {
            return {
                filters: {
                    'key_name': 'TASKING_REASON',
                }
            };
        });
        let d = new frappe.ui.form.MultiSelectDialog({ doctype: "Inventory" });
        d.dialog.hide();


    },
    get_inventory:function(frm){
        let d = new frappe.ui.form.MultiSelectDialog({
            doctype: "Inventory",
            target: frm,
            columns: ["name", "part", "lot_serial", "warehouse_location", "qty_on_hand"],
            setters: {
                part: null, 
                lot_serial: null, 
                warehouse_location: null, 
                qty_on_hand:null,
            },
            get_query() {
                return {
                    filters: {
                        qty_on_hand: [">", 0]
                    }
                };
            },
            action(selections) {
                // 'selections' berisi array ID (name) dari record yang dipilih
                if (selections.length === 0) {
                    frappe.msgprint(__('Pilih setidaknya satu lokasi.'));
                    return;
                }
                else if (selections.length  > 1){
                    frappe.msgprint(__('Hanya bisa pilih 1 baris inventory'));
                    return;
                }

                frm.set_df_property('from_to', 'hidden', 0);

                frm.set_df_property('part', 'read_only', 1);
                frm.set_df_property('description', 'read_only', 1);
                frm.set_df_property('um', 'read_only', 1);
                frm.set_df_property('location_from', 'read_only', 1);
                frm.set_df_property('lotserial_from', 'read_only', 1);
                frm.set_df_property('current_quantity', 'read_only', 1);
                frm.set_df_property('status', 'read_only', 1);

                // Iterasi setiap lokasi yang dipilih
                selections.forEach(inventory => {
                    
                    frappe.db.get_doc("Inventory", inventory).then(doc => {
                        if (doc.qty_on_hand <= 0){
                            frappe.msgprint(__('Inventory selected does not have stock'));
                            return;
                        }
                        frappe.db.get_value("Part Master", doc.part, "description").then(value => {
                             frm.set_value('description', value.message.description);
                        })
                        
                        frm.set_value('part', doc.part);
                       
                        frm.set_value('um', doc.um);
                        frm.set_value('site_from', doc.site);
                        frm.set_value('location_from', doc.warehouse_location);
                        frm.set_value('lotserial_from', doc.lot_serial);
                        frm.set_value('current_quantity', doc.qty_on_hand);
                        frm.set_value('status', doc.inventory_status);
                        frm.set_value('expire', doc.expire_date);
                        frm.set_value('inventory_name', doc.name);
              
                    });
                });

                d.dialog.hide();

            }
        });
        d.dialog.get_secondary_btn().hide();

        setTimeout(() => {
        if (d.dialog) {
            d.dialog.get_secondary_btn().hide();
        }
        }, 1);

    }
});
