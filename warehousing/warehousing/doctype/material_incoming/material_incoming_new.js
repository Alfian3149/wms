// Copyright (c) 2025, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Material Incoming", {
/*     on_submit(frm) {
        frappe.msgprint(__("MSG 0"));
        frm.doc.material_incoming_item.forEach(d => {
            frappe.msgprint(__("MSG 1"));
            if (d.total_label > 0){
                frappe.msgprint(__("MSG 2"));
                let loop_count = d.total_label;
                for (let i = 0; i < loop_count; i++) {
                    frappe.db.insert({
                        doctype: 'Material Label',
                        purchase_order: frm.doc.purchase_order,
                        //material_incoming_item_link: d.name,
                        lotserial: i.toString(),
                        pallet:d.item_number,
                        qty: d.qty_to_receive / d.total_label,
                        barcode_fwrj : d.item_number + lotserial
                    }).then(doc => {
                        console.log(doc);
                    })
                }
            }
        });
        frappe.msgprint(__("Stock Entry created successfully."));
    }, */
 	refresh(frm) {
        console.log(frm.doc);
        let ds = frm.doc.docstatus;
        frm.set_value("transaction_date", frappe.datetime.get_today())

        frm.add_custom_button(__("Print Label"), function(){
            if (ds === 0) {
                frappe.msgprint({
                    title: __('ERROR'),
                    indicator: 'red',
                    message: __('Please submit the document before printing the label.')
                });
            }
            else {
               frm.events.get_material_label(frm);
            }
            
        }).addClass("btn-warning").removeClass("btn-default");
    
        frm.add_custom_button(__("Create Task"), function(){
            console.log(frm.doc);
            if (ds === 0) {
                frappe.msgprint({
                    title: __('ERROR'),
                    indicator: 'red',
                    message: __('Please submit the document before creating a task.')
                });
            }
            new frappe.ui.form.MultiSelectDialog({
                doctype: "Material Label",
                target: this.cur_frm,
                setters: {
                    line: null,
                    item: null,
                    lotserial: null,
                    //qty: null,
                },
                filter_fields:["name", "line", "item", "lotserial"],
                add_filters_group: 0,
                date_field: "transaction_date",
                columns: ["name", "line", "item", "lotserial", "qty"],
                /* columns : [
                    {"fieldname": "line", "label": "Ln", "fieldtype": "Int", "read_only": 1},
                    {"fieldname": "item", "label": "Item", "fieldtype": "Data", "read_only": 1},
                    {"fieldname": "lotserial", "label": "Lot/serial", "fieldtype": "Data"},
                    {"fieldname": "qty", "label": "Qty", "fieldtype": "Float"},
                ], */
                get_query() {
                    return {
                        filters: { material_incoming_link: frm.doc.name }
                    }
                },
                action(selections, args) {
                    msgprint("Creating Task for " + selections.length + " selected Material Labels.");
                }
            });

 

        }).addClass("btn-warning").removeClass("btn-default");
        frm.set_df_property('material_incoming_item', 'cannot_add_rows', true);
 	},

    get_material_label: function (frm) {
		erpnext.utils.map_current_doc({
			method: "warehousing.warehousing.doctype.material_incoming.make_material_label",
			source_doctype: "Material Label",
			target: frm,
            size: "large",
            columns:  ["line", "item", "lotserial", "qty"],
			setters: {
				line: undefined,
				item: undefined,
				lotserial: undefined,
				//qty: undefined,
			},
            allow_multiselect: true,
            post_process: function(source_doc, target_doc) {
                target_doc.items.forEach(item => {
                    item.barcode_fwrj = "Custom description"; 
                });
            },
            child_columns: ["qty"], // child item columns to be displayed
			get_query()  {
                return {
				filters:{docstatus: 0,
                material_incoming_link: frm.doc.name},
                order_by: "line asc, item asc,lotserial asc"
                }
			},
            primary_action(selections) {
                msgprint("testing");
            }
		});
	},

    purchase_order(frm){
        // Data yang kita buat sebelumnya
        const purchase_order_data = {
            "purchase_order": "PY-2023-001",
            "site": "Jakarta Central Warehouse",
            "line_detail": [
                { "item_number": "ITEM-101", "qty_order": 50 }
            ]
        };

        frappe.call({
            method: "warehousing.warehousing.api.getPurchaseOrder", // Path ke fungsi Python Anda
            args:{filter_purchase_order: frm.doc.purchase_order},
            freeze: true, // Opsional: Membekukan layar dengan loading spinner
            freeze_message: __("Sedang memproses Purchase Order..."),
                callback: function(r) {
                    if (r.message) {
                        console.log(r.message);
                        if (r.message.status === "success") {
                            data = r.message;
                            frm.set_value("site", data.site);
                            frm.set_value("order_date", data.order_date);
                            frm.set_value("supplier", data.supplier_code);
                            frm.set_value("supplier_address", data.supplier_address);
                            frm.set_value("shipto", data.shipto_code);
                            frm.set_value("shipto_address", data.shipto_address);
                            
                            frm.clear_table('material_incoming_item'); // Hapus data lama

                            data.line_detail.forEach(d => {
                                let row = frm.add_child('material_incoming_item');
                                
                                // Cara efisien untuk set banyak field sekaligus
                                $.extend(row, {
                                    pod_line: d.pod_line,
                                    item_number: d.item_number,
                                    item_description: d.item_description,
                                    item_net_weight: d.item_net_weight,
                                    qty_open: d.qty_open
                                });
                            });

                            frm.refresh_field('material_incoming_item');

                        }
                    }
                    else {
                        frappe.msgprint(__("Purchase Order tidak ditemukan."));
                    }
                },
                error: function(r) {
                // Menangani error jika request gagal
                    frappe.msgprint(__("Terjadi kesalahan saat menghubungi server"));
                }
            });
    },
    full_receipt_for_all_lines(frm) {
        frm.doc.material_incoming_item.forEach(d => {
            if (frm.doc.full_receipt_for_all_lines){
                d.qty_to_receive = d.qty_open;
                d.total_label = Math.ceil(d.qty_to_receive / d.item_net_weight);
            }
            else {
                d.qty_to_receive = 0;
            }
            frm.refresh_field('material_incoming_item');
        });
    },
    initiate_receipt_location(frm) {
        frm.doc.material_incoming_item.forEach(d => {
            if (frm.doc.initiate_receipt_location){
                d.location_to_receive = frm.doc.initiate_receipt_location;
            }
            else {
                d.location_to_receive = "";
            }
            frm.refresh_field('material_incoming_item');
        }); 
    },
    assign_an_expiration_date_value_for_specified_items(frm) {
        frm.doc.material_incoming_item.forEach(d => {
            if (frm.doc.assign_an_expiration_date_value_for_specified_items){
                d.expired_date = frm.doc.assign_an_expiration_date_value_for_specified_items;
            }
            else {
                d.expired_date = "";
            }
            frm.refresh_field('material_incoming_item');
        }); 
    },

 });

frappe.ui.form.on('Material Incoming Item', {
    qty_to_receive: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        row.total_label = Math.ceil(row.qty_to_receive / row.item_net_weight);
        frm.refresh_field('material_incoming_item');
    }
});