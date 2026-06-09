// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Item Inspection", {
 	refresh(frm) {
        if (frm.doc.part && frm.doc.lotserial){
            setTimeout(() => { 
                frm.trigger('getInventory');
            }, 100);
            setTimeout(() => { 
                frm.trigger('getIncomingInfo');
            }, 400);
        }

        frm.set_query('reason', function() {
            return {
                filters: {
                    'key_name': 'inspection_reason'
                }
            };
        });


 	},

    select_itemlot:function(frm){
         frm.trigger('itemSearching');
    },

    current_position:function(frm){
        if(frm.doc.current_position){
            setTimeout(() => { 
            frm.trigger('getInventory');
            }, 300);
            setTimeout(() => { 
                frm.trigger('getIncomingInfo');
            }, 600);
        }
    }, 

    getInventory: function(frm){
         frappe.db.get_value("Inventory", {"part": frm.doc.part, "lot_serial": frm.doc.lotserial, "warehouse_location":frm.doc.current_position}, ["qty_on_hand", "inventory_status"]).then(value => {
            //frm.set_value("qty", flt(value.message.qty_on_hand));
            frm.set_value("current_status", value.message.inventory_status);
         })
    }, 

    getIncomingInfo:function(frm){
        if (frm.doc.part && frm.doc.lotserial){
            frappe.call({
            method: "warehousing.warehousing.doctype.item_inspection.item_inspection.get_incoming_information",
            args: {
                part: frm.doc.part,
                lotserial: frm.doc.lotserial
            },
            freeze: false,
            freeze_message: __("Sedang memproses perubahan data..."),
            callback: function(r) {
                    if (r.message.status === "success") {
                        frm.set_value("material_incoming_id", r.message.data.name);
                        frm.set_value("po_number", r.message.data.purchase_order);
                        frm.set_value("receiver", r.message.data.receiver);
                        frm.set_value("supplier", r.message.data.supplier);
                        frm.set_value("receipt_date", r.message.data.transaction_date);
                        frm.set_value("supplier_name", r.message.data.supplier_name);
                        frm.set_value("supplier_address", r.message.data.supplier_address);
                    }
                    else{
                        frappe.msgprint(r.message.message);
                    }

                
                }
            });
        }

    },

    itemSearching:function(frm){
        let d = new frappe.ui.Dialog({
            title: 'Lot/Serial list by Item',
            fields: [
                /* {
                    label: 'Supplier',
                    fieldname: 'spl',
                    fieldtype: 'Data'
                },
                {
                    fieldtype: "Column Break"
                },
                {
                    label: 'Supplier Name',
                    fieldname: 'spl_name',
                    fieldtype: 'Data'
                },
                {
                    fieldtype: "Column Break"
                },
                {
                    label: 'Lot/Serial',
                    fieldname: 'lotserial',
                    fieldtype: 'Data'
                },
                {
                    fieldtype: "Column Break"
                },
                {
                    label: 'Location',
                    fieldname: 'loc',
                    fieldtype: 'Data'
                },
                {
                    fieldtype: "Section Break" 
                }, */
                {
                    fieldname: "xx_item",
                    fieldtype: "Table",
                    in_place_edit: false, 
                    reqd: 1,
                    allow_filter: false, // Mematikan filter bawaan di tiap kolom
                    dynamic_link_filters: 0,
                    fields: [
                        /* { 
                            fieldname: "no", 
                            label: "No.", 
                            fieldtype: "Int", 
                            in_list_view: 1, 
                            columns: 1,
                            read_only: 1
                        },  */
                        { 
                            fieldname: "inv_name", 
                            label: "Name", 
                            fieldtype: "Data", 
                            in_list_view: 1, 
                            columns: 1,
                            hidden: 1,
                        }, 
                        { 
                            fieldname: "receiver", 
                            label: "Receiver", 
                            fieldtype: "Data", 
                            in_list_view: 1, 
                            columns: 1,
                            read_only: 1
                        }, 
                        { 
                            fieldname: "date_received", 
                            label: "Date Received", 
                            fieldtype: "Date", 
                            in_list_view: 1.5, 
                            columns: 2,
                            read_only: 1
                        }, 
                        { 
                            fieldname: "supplier", 
                            label: "supplier", 
                            fieldtype: "Data", 
                            in_list_view: 1, 
                            columns: 1,
                            read_only: 1
                        }, 
                        { 
                            fieldname: "supplier_name", 
                            label: "Name", 
                            fieldtype: "Data", 
                            in_list_view: 2.5, 
                            columns: 2,
                            read_only: 1
                        }, 
                        { 
                            fieldname: "lotserial", 
                            label: "Lot/Serial", 
                            fieldtype: "Data", 
                            in_list_view: 1, 
                            columns: 2,
                            read_only: 1
                        }, 
                        { 
                            fieldname: "location", 
                            label: "Location", 
                            fieldtype: "Data", 
                            in_list_view: 1, 
                            columns: 1,
                            read_only: 1
                        }, 
                        { 
                            fieldname: "stock", 
                            label: "Stock", 
                            fieldtype: "Float", 
                            in_list_view: 1, 
                            columns: 0.5,
                            read_only: 1
                        }, 
                        { 
                            fieldname: "selected", 
                            label: "Sel", 
                            fieldtype: "Check", 
                            in_list_view: 1, 
                            columns: 0.5,
                            read_only: 1
                        }, 
                    ]
                }
            ],
            size: 'extra-large', // small, large, extra-large 
            primary_action_label: 'Confirm',
            primary_action(values) {
                const items = d.get_values().xx_item;
                    
                const grid = d.get_field('xx_item').grid;
                const selected_rows = grid.get_selected_children();

                if (selected_rows.length === 0) {
                    frappe.msgprint({
                        title: __('ERROR'),
                        indicator: 'red',
                        message: __('Silakan pilih setidaknya satu baris menggunakan checkbox.')
                    });
                    return;
                }

                let name_list = [];
                for (let row of selected_rows) {
                    name_list.push(row.inv_name);
                }

                lotserial_selected(frm, name_list);

                d.hide();
            }
        });

        frappe.call({
            method: "warehousing.warehousing.doctype.item_inspection.item_inspection.get_item_received",
            args: {
                part: frm.doc.part,
            },
            freeze: false,
            freeze_message: __("Sedang memproses perubahan data..."),
            callback: function(r) {
                if (r.message && r.message.status === "success") {
                    
                    // 1. Buat array kosong untuk menampung data baru
                    let dialog_data = [];
                    let no = 1;

                    r.message.data.forEach(row => {
                        dialog_data.push({
                            'no': no++, // Menambahkan nomor urut otomatis
                            'inv_name': row.inv_name, // DISESUAIKAN: dari inv_name (backend) ke inv_name (dialog)
                            'receiver': row.receiver,
                            'date_received': row.date_received,
                            'supplier': row.supplier,
                            'supplier_name': row.supplier_name,
                            'lotserial': row.lot_serial, // DISESUAIKAN: dari lot_serial (backend) ke lotserial (dialog)
                            'location': row.location,
                            'stock': row.stock,
                            'selected': 0 // DISESUAIKAN: dari 'sel' menjadi 'selected' sesuai fieldname dialog
                        });
                    });

                    // 2. Masukkan array data ke property data milik field table dialog
                    d.fields_dict.xx_item.df.data = dialog_data;
                    let grid = d.fields_dict.xx_item.grid;

                    grid.cannot_add_rows = true;
                    grid.cannot_delete_rows = true; 
                    grid.only_from_master = false; 
                    grid.allow_on_grid_filter = false;

                    // Fungsi Pembersih Elemen yang dipanggil setiap kali page berubah atau di-render ulang
                    const clean_up_grid_ui = () => {
                        setTimeout(() => {
                            // Hapus tombol Delete massal dan tombol aksi hapus lainnya
                            d.$wrapper.find('.grid-custom-buttons, .btn-delete-rows, .grid-remove-rows').remove();
                            
                            // Sembunyikan tombol pensil edit di ujung kanan tiap baris
                            d.$wrapper.find('.btn-open-row').hide(); 

                        }, 50);
                    };
                    // === KUNCI PENGAMAN ANTIPAGINATION ===
                    // Jalankan fungsi pembersih setiap kali user pindah halaman tabel
                    grid.on_page_changed = () => {
                        clean_up_grid_ui();
                    };

                    // Jalankan fungsi pembersih setiap kali baris tabel selesai di-render ulang
                    grid.on_render = () => {
                        clean_up_grid_ui();
                    };

                    // Render pertama kali
                    grid.refresh();
                    clean_up_grid_ui();

                }
                else {
                    // Antisipasi jika r.message null atau statusnya gagal
                    let msg = (r.message && r.message.messages) ? r.message.messages : "Terjadi kesalahan saat mengambil data.";
                    frappe.msgprint(msg);
                }
            }
        });

        d.show();

        frappe.dom.set_style(`  
            #page-Item\\ Inspection .modal-dialog .btn-open-row,
            #page-Item\\ Inspection .modal-dialog .grid-custom-buttons,
            #page-Item\\ Inspection .modal-dialog .btn-delete-rows,
            #page-Item\\ Inspection .modal-dialog .grid-remove-rows {
                display: none !important;
            }
        `);

    }, 

    lotserial_selected:function(frm, inv_id_list){
        if (inv_id_list.length > 0) {
            frappe.call({
                method: "warehousing.warehousing.doctype.item_inspection.item_inspection.lotserial_selected", // Memanggil fungsi backend
                args: {
                    inv_id_list: inv_id_list,
                },
                freeze: true,
                freeze_message: __("Creating Warehouse Task..."),
                callback: function(r) {
                }
            });
        }
    }
});
