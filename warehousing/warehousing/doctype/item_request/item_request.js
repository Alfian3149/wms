// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on('Item Request', {
	refresh(frm) {
        if (!frm.doc.required_by){
            frm.set_value('required_by', frappe.datetime.get_today());
        }
        if (!frm.doc.requestor_by){
            frm.set_value('requestor_by', frappe.session.user); 
        }

        
        frm.add_custom_button(__('Print Label'), function() {
            if (frm.is_new()){
                frappe.msgprint({
                    title: __('ERROR'),
                    indicator: 'red',
                    message: __('Document is not saved yet. Please save it first.')
                });
                e.preventDefault();
                e.stopPropagation();
            } 
           

            let grid = frm.get_field('items').grid;
            let selected_items = grid.get_selected();

            if (!selected_items || selected_items.length === 0) {
                frappe.msgprint({
                    title: __('ERROR'),
                    indicator: 'red',
                    message: __('There is not row checked. Please check first the row to printed.')
                });
                return;
            }

            let name_list = [];
            for (let row of selected_items) {
                name_list.push(row);
            }
            print_selected_labels(name_list);

        })


        frm.trigger('reserved_material_detail');

        if (frm.doc.purpose === 'Return Supplier'){
            frm.trigger('open_hidden_field');

            frm.add_custom_button(__('Confirm PO Return'), function() {
                if (frm.doc.request_status === 'Ready To Issued') {
                    frappe.confirm('Apakah Anda yakin ingin melakukan PO Return Confirmation ke QAD?', () => {
                        frappe.call({
                            method: "warehousing.warehousing.api_return_po.po_return_confirmation",
                            args: {
                                parent_doc_name: frm.doc.name,
                            },
                            freeze: true,
                            freeze_message: __("Sedang memproses PO Return Confirmation..."),
                            callback: function(r) {
                                 if (r.message.status === "failed") {
                                    frappe.show_alert({ message: __(r.message.message), indicator: 'red' });
                                    dialog.hide();
                                    return;
                                }
                                else {
                                    frm.reload_doc()    
                                    
                                    frappe.show_alert({
                                        message: __('PO Return QAD succesfully with Receiver : {0}', [r.message.receiver]),
                                        indicator: 'green'
                                    });
                                }
                            }
                        });
                    });
                }
                else {
                    frappe.msgprint({
                            title: __('Validation'),
                            indicator: 'red',
                            message: __('Based on the status document, you are not allowed to return PO right now')
                    });
                }
            }, __("Return to supplier"));
        }

        frm.set_query('material_incoming_id', function() {
            return {
                filters: {
                    'receiver': ['!=', ''],
                }
            };
        });

        let d = new frappe.ui.form.MultiSelectDialog({ doctype: "Inventory" });
	},

    material_incoming_id:function(frm){
        frappe.db.get_list('Material Label', {
            filters: {
                'material_incoming_link': frm.doc.material_incoming_id, // Nama dokumen induknya
            },
            fields: ['*'], // Ambil semua field
            limit: 100,
            order_by: 'line asc, item asc, lotserial asc',
                
        }).then(data => {
                if (data && data.length > 0) {
                    frm.clear_table('items');

                    data.forEach(row => {
                        let items = frm.add_child('items');
                        items.part = row.item;    
                        items.description = row.description;    
                        items.um = row.um;                           
                        items.purchase_order = frm.doc.purchase_order;    
                        items.line_order = row.line;    
                        items.supplier = frm.doc.supplier;    
                        items.lotserial = row.lotserial;    
                        items.target_location = frm.doc.target_location;    
                        
                        frappe.db.get_value('Part Master', row.item, 'item_group').then(value => {
                            items.item_group = value.message.item_group;  
                        })

                        frappe.db.get_value('Inventory', {"site":"1000", "part":row.item, "lot_serial": row.lotserial, "qty_on_hand": [">",0]}, ['qty_on_hand', 'warehouse_location'])
                        .then(value => {
                            items.from_location = value.message.warehouse_location;
                            items.quantity_requested = value.message.qty_on_hand;
                        });
                    });
                    setTimeout(() => { 
                     frm.refresh_field('items');
                    },200);

                }
        });
    

    },

    purpose:function(frm){
        frm.trigger('open_hidden_field');
    }, 

    open_hidden_field:function(frm){
        let fields_to_hidden = ['material_incoming_id', 'purchase_order', 'receiver', 'supplier', 'supplier_name'];

        if (frm.doc.purpose === "Return Supplier"){
            fields_to_hidden.forEach(field => {
                frm.set_df_property(field,"hidden", 0);
            });
            frm.set_df_property("open_and_select_inventory_list","hidden", 1);
            frm.set_df_property('material_incoming_id', 'reqd', 1);
            //frm.clear_table('items');
            //frm.refresh_field('items');
        }
        else if (frm.doc.purpose === "Manufacture"){
            frm.set_df_property("open_and_select_inventory_list","hidden", 1);
        }
        else {
            fields_to_hidden.forEach(field => {
                frm.set_df_property("open_and_select_inventory_list","hidden", 0);
                frm.set_df_property(field,"hidden", 1);
                frm.set_df_property('material_incoming_id', 'reqd', 0);
            });

        }
    }, 

    open_and_select_inventory_list:function(frm){

        let d = new frappe.ui.form.MultiSelectDialog({
            doctype: "Inventory",
            target: this.cur_frm,
            columns: ["name", "part", "lot_serial", "warehouse_location", "qty_on_hand", "qty_handovered", "inventory_status"],
            setters: {
                part: frm.doc.part ? frm.doc.part : null , 
                lot_serial: null, 
                warehouse_location: frappe.user.has_role('Production Manager') || frappe.user.has_role('System Manager') ?  "WH04" : null, 
                qty_on_hand:null,
                qty_handovered:null,
                inventory_status:null,
            }, 
            size: 'extra-large',
           /*  get_query() {
                return {
                    filters: [{qty_on_hand: [">", 0]}]
                };
            },   */ 
            action(selections) {
                if (selections.length === 0) {
                    frappe.msgprint(__('Pilih setidaknya satu lokasi.'));
                    return;
                }
                // Iterasi setiap lokasi yang dipilih
  
                selections.forEach(inventory => {
                    
                    frappe.db.get_doc("Inventory", inventory).then(doc => {
                        if (doc.qty_on_hand > 0){
                            let child = frm.add_child('items');
                            child.part = doc.part;
                            child.um = doc.um;
                            child.lotserial = doc.lot_serial;
                            child.quantity_requested = doc.qty_on_hand;
                            child.expire = doc.expire_date;
                            child.from_location = doc.warehouse_location;
                            child.target_location = frm.doc.target_location;

                            frappe.db.get_value("Part Master", doc.part, ["item_group", "description"]).then(value => {
                                child.description = value.message.description;
                                child.item_group = value.message.item_group;
                            })
                        }
                        
                    });
                });

                setTimeout(() => { 
                    frm.refresh_field('items');
                }, 1000);

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

})

function print_selected_labels(label_ids) {
    if (!label_ids || label_ids.length === 0) {
        frappe.msgprint("Pilih label terlebih dahulu.");
        return;
    }

    frappe.call({
        method: "warehousing.warehousing.doctype.material_label.material_label.generate_bulk_print_html",
        args: {
            docnames: label_ids,
            doctype: "Item Request Detail"
        },
        freeze: true,
        freeze_message: __("Preparing Labels..."),
        callback: function(r) {
            if (r.message) {
                var win = window.open('', '_blank');
                win.document.write(r.message); 
                win.document.close();
                
                setTimeout(function() {
                    win.print();
                }, 2000);
            }
        }
    });
}
