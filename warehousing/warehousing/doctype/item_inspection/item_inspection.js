// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Item Inspection", {
 	refresh(frm) {  
        if (frm.is_dirty()) {
            frm.dashboard.set_headline("");
            frm.dashboard.clear_headline();
        }

        frm.toggle_reqd('return_for_date', true);
        frm.toggle_reqd('return_location', true);
        if (!frm.doc.return_for_date){
            frm.set_value('return_for_date', frappe.datetime.now_datetime());
        }
        if (!frm.doc.return_location){
            frm.set_value('return_location', '-');
        }

        calculate_total_selected(frm);

       

        if (frm.doc.part){
            frm.set_df_property('description', 'read_only', true);
            frm.set_df_property('um', 'read_only', true);
        }
        frm.set_df_property('inspection_details', 'cannot_add_rows', true);
        frm.set_df_property('inspection_details', 'cannot_delete_rows', true);

        if (frm.doc.part && frm.doc.lotserial){
            setTimeout(() => { 
                frm.trigger('getInventory');
            }, 100);

            setTimeout(() => { 
                frm.trigger('getIncomingInfo');
            }, 400);
        }

        $(frm.fields_dict['inspection_details'].wrapper).on('click', 'input[type="checkbox"]', function(e) {
            let grid = frm.fields_dict['inspection_details'].grid;
            
            // Ambil baris HTML tempat checkbox diklik
            let $clicked_row = $(this).closest('.grid-row');
            let clicked_name = $clicked_row.attr('data-name');

            // Cari data doc berdasarkan baris yang diklik
            let row_data = frm.doc.inspection_details.find(d => d.name === clicked_name); 

            setTimeout(() => {
                let selected_rows = grid.get_selected();
                
                frm.doc.inspection_details.forEach(d => {
                    let status = selected_rows.includes(d.name) ? 1 : 0;
                    if (d.is_selected !== status) {
                        frappe.model.set_value(d.doctype, d.name, 'is_selected', status);
                    }
                });
            }, 50);
        });
        
        frm.events.sync_grid_selection(frm);

        let grid_wrapper = frm.fields_dict['inspection_details'].$wrapper;

        grid_wrapper.off('click', '.btn-secondary ').on('click', '.btn-secondary', function() {
            frm.events.sync_grid_selection(frm);
        });
    
        frm.set_query('reason', function() {
            return {
                filters: {
                    'key_name': 'inspection_reason'
                }
            };
        });

        if (!frm.is_new() && !frm.is_dirty() && frm.doc.doc_status === 0 && frm.doc.status === "New") {
            frm.dashboard.set_headline("Submit document to confirm", "blue");
            frm.page.set_primary_action(__('Submit'), function() {
                let selected_rows = frm.fields_dict['inspection_details'].grid.get_selected();
                let message_title = __('Apakah Anda yakin ingin melakukan Submit?');
                let message_desc = __('Data yang sudah di-submit tidak dapat diubah kembali.');

                if (selected_rows.length === 0) {
                    message_title = __('Tidak ada item yang dipilih!');
                    message_desc = __('Anda belum mencentang item apa pun. Apakah Anda yakin tetap ingin melakukan Submit?');
                }

                frappe.warn(
                    message_title,
                    message_desc,
                    () => { 
                        frm.set_value("status", "Processed");
                        frm.set_value("doc_status", 1);
                        frm.save(); 
                    },
                    __('Continue') // Kamu bisa kustom teks tombol primarinya di sini
                );
            });
        }

        if (frm.doc.doc_status === 1) {
            frm.page.clear_primary_action();
            frm.set_df_property('inspection_details', 'read_only', 1);
        }
 	},

    sync_grid_selection: function(frm) {
        // Iterasi setiap baris di child table 'items'
        frm.doc.inspection_details.forEach(d => {
            // Jika data is_selected bernilai true (1)
            if (d.is_selected) {
                // Cari index baris berdasarkan nama/ID baris
                let grid_row = frm.fields_dict['inspection_details'].grid.grid_rows_by_docname[d.name];
                
                if (grid_row) {
                    // Berikan centang pada checkbox bawaan secara visual
                    grid_row.select(true);
                }
            }
        });
        
        // Refresh grid untuk memastikan tampilan checkbox terupdate
        frm.fields_dict['inspection_details'].grid.refresh();
    },


    select_itemlot:function(frm){
         frm.trigger('searchingLotSerialByItem');
    },

    searchingLotSerialByItem:function(frm){
        frappe.call({
            method: "warehousing.warehousing.doctype.item_inspection.item_inspection.get_item_received",
            args: {
                part: frm.doc.part,
            },
            freeze: true,
            freeze_message: __("Fetching item received data by " + frm.doc.part),
            page_length : 20,
            callback: function(r) {
                if (r.message && r.message.status === "success") {
                    
                    // 1. Buat array kosong untuk menampung data baru
                    let dialog_data = [];
                    let no = 1;

                    frm.clear_table('inspection_details');
                    r.message.data.forEach(row => {
                        let inspection_details = frm.add_child("inspection_details");
                        inspection_details.supplier = row.supplier;
                        inspection_details.supplier_name = row.supplier_name;
                        inspection_details.part = frm.doc.part;
                        inspection_details.lotserial = row.lot_serial;
                        inspection_details.quantity = row.stock;
                        inspection_details.location = row.location;
                        inspection_details.inventory_status = row.inventory_status;

                        /* dialog_data.push({
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
                        }); */
                    });
                    frm.refresh_field("inspection_details");
                }
            }
        });
        setTimeout(() => { 
            frm.fields_dict['inspection_details'].grid.page_length = 20;
            frm.fields_dict['inspection_details'].grid.refresh();
        }, 200);
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
                    else {
                       // toggle_no_data_message(frm);
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
    }, 

    
});

frappe.ui.form.on('Item Inspection Detail', { 
    is_selected: function(frm, cdt, cdn) {
        calculate_total_selected(frm);
    },
    quantity: function(frm, cdt, cdn) {
        // Jaga-jaga jika quantity diubah saat posisi tercentang
        calculate_total_selected(frm);
    },
    // Trigger saat baris dihapus
    picking_items_remove: function(frm) {
        calculate_total_selected(frm);
    }
});

function calculate_total_selected(frm) {
    let total = 0;
    
    // Looping setiap baris di child table
    (frm.doc.inspection_details || []).forEach(row => {
        // Jika baris dicentang, tambahkan quantity-nya
        if (row.is_selected) {
            total += flt(row.quantity);
        }
    });
    
    // Set nilai ke field total di Doctype Induk
    frm.set_value('total_qty', total);
}

function toggle_no_data_message(frm) {
    // Desain komponen alert "Data Not Found" ala Frappe yang bersih dan rapi
    let html_content = `
        <div class="text-center text-muted" style="padding: 30px 10px; border: 1px dashed #d1d8dd; border-radius: 4px;">
           
            <div style="font-weight: 500;">Data Not Found</div>
            <small style="color: #8492a6;">Data penerimaan material untuk item dan lot/serial ini belum tersedia.</small>
        </div>
    `;

    // Jika data ada, kosongkan HTML dan sembunyikan field-nya
    frm.get_field('message').html(html_content);
    frm.toggle_display('message', true);
}