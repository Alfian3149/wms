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
            if (ds === 0) {
                frappe.msgprint({
                    title: __('ERROR'),
                    indicator: 'red',
                    message: __('Please submit the document before creating a task.')
                });
            }
            //frappe.new_doc("Material Label");
            let dialog = new frappe.ui.Dialog({
                title: __("Material Label"),
                fields: [
                    {
                        fieldname: "xx_material_incoming_item",
                        fieldtype: "Table",
                        label: "Child Table",
                        in_place_edit: false, // Allows editing in the grid
                        reqd: 1,
                        data: [],
                        fields: [
                            { 
                                fieldname: "no", 
                                label: "No.", 
                                fieldtype: "Int", // Pastikan huruf kapital "Int"
                                in_list_view: 1, 
                                columns: 1,
                                read_only: 1 // Biasanya nomor urut dibuat read-only
                            },
                            { 
                                fieldname: "line", 
                                label: "PO Line", 
                                fieldtype: "Int", // Pastikan huruf kapital "Int"
                                in_list_view: 1, 
                                reqd: 1, 
                                columns: 1,
                                read_only: 0 // Pastikan tidak 1
                            },
                            { 
                                fieldname: "item", 
                                label: "Item", 
                                fieldtype: "Data", 
                                in_list_view: 1,  
                                reqd: 1, 
                                columns: 3 
                            },
                            { 
                                fieldname: "lotserial", 
                                label: "Lotserial", 
                                fieldtype: "Data", 
                                in_list_view: 1,  
                                reqd: 1, 
                                columns: 3
                            },
                            { 
                                fieldname: "qty", 
                                label: "Qty", 
                                fieldtype: "Float", 
                                in_list_view: 1, 
                                reqd: 1, 
                                columns: 3 
                            }
                        ]
                    }
                ],
                size: 'large',
                primary_action_label: __("Submit"),
                primary_action(values) {
                    
                    console.log(values); // 'values.my_table' contains array of row data
                    dialog.hide();
                }
            });

            frappe.db.get_list('Material Label', {
                filters: {
                    'material_incoming_link': frm.doc.name, // Nama dokumen induknya
                },
                fields: ['*'], // Ambil semua field
                order_by: 'line asc'
            }).then(data => {
                if (data && data.length > 0) {
                    // Melakukan looping untuk menambahkan nomor urut
                    data.forEach((row, index) => {
                        // index dimulai dari 0, maka ditambah 1
                        row.no = index + 1; 
                        
                        // Jika Anda punya field custom bernama 'no_urut' di child table dialog:
                        // row.no_urut = index + 1; 
                    });

                    dialog.get_field('xx_material_incoming_item').df.data = data;
                    dialog.get_field('xx_material_incoming_item').refresh();
                }
            });
            dialog.show();
            //dialog.fields_dict.line.$wrapper.html('Hello World');
            /* dialog.fields_dict['xx_material_incoming_item'].grid.on_add_row = function(row) {
                msgprint("Row added");
                let row_count = dialog.fields_dict.xx_material_incoming_item.grid.get_data().length;
                row.no = 100;
                row.qty = 0;
                row.line = 0;
                dialog.get_field("xx_material_incoming_item").refresh();
            }; */

           /*  dialog.fields_dict.xx_material_incoming_item.grid.add_new_row = function(idx, callback, show, copy_doc) {
                //console.log("Row added" + JSON.stringify(copy_doc));
                //dialog.get_field("xx_material_incoming_item").refresh();
                let grid = dialog.get_field("xx_material_incoming_item").grid;
                grid.refresh();
            }; */
            
            // Saat mendefinisikan dialog
            dialog.fields_dict.xx_material_incoming_item.grid.add_new_row = function(row) {
                // 1. Logika pengisian data
                console.log("Baris baru terdeteksi");
                
                // Gunakan frappe.model.set_value agar trigger UI sinkron
                //row.qty = 0;
                //row.no = dialog.fields_dict.xx_material_incoming_item.grid.get_data().length;

                // 2. Gunakan setTimeout agar refresh berjalan setelah proses internal Frappe selesai
                setTimeout(() => {
                    dialog.get_field("xx_material_incoming_item").refresh();
                }, 100);
            };
                //msgprint("Row added");
                //let row_count = dialog.fields_dict.xx_material_incoming_item.grid.get_data().length;
               
                //let last_row = dialog.fields_dict.xx_material_incoming_item.grid.get_data()[row_count - 1];
                //msgprint("Row Count: " + last_row.owner);
                //last_row.no = row_count;
                //dialog.get_field("xx_material_incoming_item").refresh();
                 //}
            /* dialog.fields_dict.xx_material_incoming_item.grid.setup_add_row = function() {
                if (dialog.fields_dict.xx_material_incoming_item.grid.get_data().length >= 5) {
                    frappe.throw(__("Maksimal hanya boleh 5 baris."));
                    return false;
                }
            }; */
        

            

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