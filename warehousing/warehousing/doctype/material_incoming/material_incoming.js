// Copyright (c) 2025, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Material Incoming", {

    refresh(frm) {
        frm.disable_save_notification = true;
        frm.set_df_property('status', 'read_only', 0);
        frm.set_df_property('doc_status', 'hidden', 1);
        frm.set_df_property('status', 'read_only', 1);

        frm.fields_dict['material_incoming_item'].grid.wrapper.find('.grid-row-checkbox').hide();
        frm.fields_dict['material_incoming_item'].grid.wrapper.find('.row-check').hide();

        frm.fields_dict['purchase_order'].$input.on('blur', function() {
            if (frm.doc.purchase_order && !frm.doc.status) { // Pastikan ada nomor PO dan dokumen sudah disimpan sebelumnya
                frm.trigger('fetch_po_from_qad');
                setTimeout(() => { 
                    frm.trigger('load_po_history');
                }, 500);   
            }
        });
        
        if (frm.doc.receiver){
            if(frm.doc.putaway_transfer_task_id){
                frm.set_df_property('rerun_putaway_ts', 'hidden', 1);
            }
            else{
                frm.set_df_property('rerun_putaway_ts', 'hidden', 0);
            }
        }

        if (frm.doc.doc_status === 1){
            let fields_to_disable = ['full_receipt_for_all_lines', 'assign_an_expiration_date_value_for_specified_items', 'initiate_receipt_location', 'material_incoming_item'];

            fields_to_disable.forEach(field => {
                frm.set_df_property(field, 'read_only', 1);
            });

            frm.page.clear_primary_action();
            if (frm.doc.status !== "Confirmed" && frm.doc.status !== "Transferring"){ 
                frm.page.set_primary_action(__('Cancel'), function() {
                    frappe.confirm(
                        __('Apakah Anda yakin ingin melakukan cancel?'),
                        function() { 
                            //frappe.msgprint("test");
                            frm.set_value("status", "Cancelled"); // Set status menjadi Submitted
                            frm.set_value("doc_status", 2); // Set status menjadi Submitted
                        
                            frm.save().then(() => {
                                frappe.hide_msgprint();
                                frappe.utils.play_sound("cancel");
                                frappe.show_alert({
                                    message: __('Document Cancelled'),
                                    indicator: 'red'
                                });
                            });
                        },
                        function() {
                        },
                    );
                }).addClass('btn-light');
            }
            
        }
        else if(frm.doc.doc_status === 2){
            frm.set_read_only();
            frm.page.clear_primary_action();
        }

        if (!frm.is_new() && frm.doc.doc_status === 0 && frm.doc.status === "Draft") {
            frm.page.set_primary_action(__('Submit'), function() {
                frappe.confirm(
                    __('Apakah Anda yakin ingin melakukan Submit? Data yang sudah di-submit tidak dapat diubah kembali.'),
                    function() { 
                        //frappe.msgprint("test");
                        frm.set_value("status", "Submitted"); // Set status menjadi Submitted
                        frm.set_value("doc_status", 1); // Set status menjadi Submitted
                        
                        frappe.hide_msgprint();
                        //frappe.utils.play_sound("submit");
                        frm.save(); //.then(() => {
                            /* frappe.show_alert({
                                message: __('Document Submitted'),
                                indicator: 'green'
                            }); */
                        //});
                        

                    },
                    function() {
                    },
                );
            });
        }
        let ds = frm.doc.doc_status;
        if (frm.doc.transaction_date == null || frm.doc.transaction_date == undefined || frm.doc.transaction_date == "" ){
            frm.set_value("transaction_date", frappe.datetime.get_today())
        }
    
        // --- GRUP 1: VERIFICATION ---
        frm.add_custom_button(__('Print & Update Label'), function() {
            if (ds === 0) {
                frappe.msgprint({
                    title: __('ERROR'),
                    indicator: 'red',
                    message: __('Please submit the document before print and update label.')
                });
                return
            }
            else if(ds === 2){
                frappe.msgprint({
                    title: __('ERROR'),
                    indicator: 'red',
                    message: __('Document already cancelled.')
                });
                return
            }
            const dialog = new frappe.ui.Dialog({
                title: __("Material Label"),
                fields: [
                    {
                        label: __("Filtering Options"),
                        fieldtype: "Section Break" 
                    },
                    {
                        label: __("Line"),
                        fieldname: "filter_line",
                        fieldtype: "Int",
                        onchange: () => {
                            sync_filter_item(dialog);
                        }
                    },
                    {
                        fieldtype: "Column Break"
                    },
                    {
                        label: __("Item"),
                        fieldname: "filter_item",
                        fieldtype: "Data",
                        /* options: "Part Master", */
                        onchange: () => {
                            sync_filter_item(dialog);
                        }
                    },
                    {
                        fieldtype: "Column Break"
                    },
                    {
                        label: __("Lot/Serial"),
                        fieldname: "filter_lot",
                        fieldtype: "Data",
                        /* options: "Part Master", */
                        onchange: () => {
                            sync_filter_item(dialog);
                        }
                    },
                    {
                        fieldtype: "Section Break" 
                    },
                    
                    {
                        fieldname: "xx_material_incoming_item",
                        fieldtype: "Table",
                        in_place_edit: true, 
                        reqd: 1,
                        data: [],
                        fields: [
                            { 
                                fieldname: "no", 
                                label: "No.", 
                                fieldtype: "Int", 
                                in_list_view: 1, 
                                columns: 1,
                                read_only: 1
                            },
                            { 
                                fieldname: "name", 
                                label: "Name", 
                                fieldtype: "Data",
                                in_list_view: 1, 
                                reqd: 1, 
                                columns: 1,
                                hidden: 1
                            },
                            { 
                                fieldname: "line", 
                                label: "PO Line", 
                                fieldtype: "Int",
                                in_list_view: 1, 
                                reqd: 1, 
                                columns: 1,
                            },
                            { 
                                fieldname: "item", 
                                label: "Item", 
                                fieldtype: "Link", 
                                options: "Part Master",
                                in_list_view: 1,  
                                reqd: 1, 
                                columns: 2
                            },
                            { 
                                fieldname: "description", 
                                label: "Description", 
                                fieldtype: "Data", 
                                in_list_view: 1,  
                                reqd: 0, 
                                columns: 3 
                            },
                            { 
                                fieldname: "lotserial", 
                                label: "Lotserial", 
                                fieldtype: "Data", 
                                in_list_view: 1,  
                                reqd: 1, 
                                columns: 2
                            },
                            { 
                                fieldname: "qty", 
                                label: "Qty", 
                                fieldtype: "Float", 
                                in_list_view: 1, 
                                reqd: 1, 
                                columns: 1
                            }
                        ],
                        on_add_row: (idx) => {
                            let data_id = idx - 1;
                            let material_label = dialog.fields_dict.xx_material_incoming_item;
                            material_label.df.data[data_id].no = idx;
                            material_label.grid.refresh();
                        },
                        label_remove: function(frm) {
                            msgprint("Row deleted");
                        },
                        remove_rows_button: (idx) => {
                            msgprint(`Row deleted: ${idx}`);
                        }
                    }
                ],
        
                size: 'large',
                secondary_action_label: __("Print"),
                secondary_action() {
                    const items = dialog.get_values().xx_material_incoming_item;
                    
                    const grid = dialog.get_field('xx_material_incoming_item').grid;
                    const selected_rows = grid.get_selected_children();

                    if (selected_rows.length === 0) {
                        frappe.msgprint({
                            title: __('ERROR'),
                            indicator: 'red',
                            message: __('Silakan pilih setidaknya satu baris menggunakan checkbox.')
                        });
                        return;
                    }

                    if (frm.doc.status !== "Printed") {
                        frm.set_value('status', 'Printed');
                        
                        if(!frm.doc.printed_date){    
                            frm.set_value('printed_date', frappe.datetime.now_datetime());   
                        } 
                    
                        setTimeout(() => { 
                            frm.events.create_physical_verification_task(frm, 'Physical Verification', '', '', frappe.datetime.get_today(), frappe.datetime.now_time());
                        }, 800);
                   
                    }
                    let name_list = [];
                    for (let row of selected_rows) {
                        name_list.push(row.name);
                    }
                    

                            
                    print_selected_labels(name_list);

                    //selected_data = selected_rows;
                    //handle_print(selected_data);
                },
                primary_action_label: __("Save Changes"),
                primary_action(values) {
                    let table_data = dialog.get_field('xx_material_incoming_item').grid.get_data();

                    // 2. Validasi: Cek apakah tabel kosong
                    if (table_data.length === 0) {
                        frappe.msgprint({
                            title: __('Validasi Gagal'),
                            indicator: 'red',
                            message: __('Tabel tidak boleh kosong. Tambahkan setidaknya satu baris.')
                        });
                        return;
                    }
                    let errors = [];
                    table_data.forEach((row, index) => {
                        let row_num = index + 1;
                        
                        // Daftar field yang wajib diisi
                        if (!row.line) errors.push(__("Baris {0}: Line harus diisi", [row_num]));
                        if (!row.item) errors.push(__("Baris {0}: Item harus diisi", [row_num]));
                        if (!row.lotserial) errors.push(__("Baris {0}: Lotserial harus diisi", [row_num]));
                        if (!row.qty || flt(row.qty) <= 0) errors.push(__("Baris {0}: Qty harus lebih dari 0", [row_num]));
                    });

                    // Jika ada error, tampilkan pesan dan hentikan proses (return)
                    if (errors.length > 0) {
                        frappe.msgprint({
                            title: __('Data Belum Lengkap'),
                            indicator: 'red',
                            message: errors.join("<br>")
                        });
                        return; // Berhenti di sini, tidak lanjut ke frappe.call
                    }

                    frappe.call({
                        method: "warehousing.warehousing.doctype.material_label.material_label.sync_material_labels",
                        args: {
                            data: JSON.stringify(table_data),
                            parent_doc_name: cur_frm.doc.name
                        },
                        freeze: true,
                        freeze_message: __("Sedang memproses perubahan data..."),
                        callback: function(r) {
                            if (r.message.status === "success") {
                                frappe.show_alert({ message: __(r.message.message), indicator: 'green' });
                                dialog.hide();
                            }
                        }
                    });
                }
            });

            // 2. Tambahkan trigger saat baris akan dihapus
            dialog.get_field('xx_material_incoming_item').grid.wrapper.on('click', '.grid-remove-row', function() {
                // Ini akan terpanggil tepat saat tombol sampah (delete) diklik
                 msgprint("Row deleted");
            });

            dialog.get_field('xx_material_incoming_item').grid.on_row_delete = function(doc, cdt, cdn) {
                msgprint("Row deleted");
            }
            
            frappe.db.get_list('Material Label', {
                filters: {
                    'material_incoming_link': frm.doc.name, // Nama dokumen induknya
                },
                fields: ['*'], // Ambil semua field
                order_by: 'line asc, item asc, lotserial asc'
            }).then(data => {
                if (data && data.length > 0) {
                    data.forEach((row, index) => {
                        row.no = index + 1; 
                    });
                    
                    const items = [...new Set(data.map(d => d.item))];
                    
                    frappe.call({
                        method: 'frappe.client.get_list',
                        args: {
                            doctype: 'Part Master',
                            filters: { 'part': ['in', items] },
                            fields: ['part', 'description']
                        },
                        callback: function(r) {
                            if (r.message) {
                                
                                // Buat mapping deskripsi { "ITEM01": "Deskripsi A" }
                                let descriptions = {};
                                r.message.forEach(dt => {
                                    descriptions[dt.part] = dt.description;
                                });

                                // 3. Gabungkan deskripsi ke data asli
                                data.forEach(row => {
                                    
                                    row.description = descriptions[row.item] || "";
                                });

                                // 4. Set data ke tabel dialog dan refresh
                                dialog.get_field('xx_material_incoming_item').df.data = data;
                                dialog.get_field('xx_material_incoming_item').refresh();
    
                            }
                        }
                    });
                    

                    /* dialog.get_field('xx_material_incoming_item').df.data = data;
                    dialog.get_field('xx_material_incoming_item').refresh(); */
                }
            });
            dialog.show();
        }, __("Labeling & Verification"));

        // --- GRUP 2: RECEIPT & PUTAWAY ---
        frm.add_custom_button(__('Confirm PO Receipt'), function() {
            //alert(frm.doc.physical_verification_id);
            frappe.db.get_value('Warehouse Task', frm.doc.physical_verification_id, 'status')
            .then(value => {
                if (value && value.message.status === "Completed"){ 
                    // Konfirmasi ke user sebelum eksekusi
                    frappe.confirm('Apakah Anda yakin ingin melakukan PO Receipt Confirmation ke QAD?', () => {
                        frappe.call({
                            method: "warehousing.warehousing.allAPI.po_receipt_confirmation",
                            args: {
                                parent_doc_name: frm.doc.physical_verification_id,
                                material_incoming_name: frm.doc.name
                            },
                            freeze: true,
                            freeze_message: __("Sedang memproses PO Receipt Confirmation..."),
                            callback: function(r) {
                                if (r.message.status === "failed") {
                                    frappe.show_alert({ message: __(r.message.message), indicator: 'red' });
                                    dialog.hide();
                                }
                                else {
                                    frm.set_value('receiver', r.message.receiver);
                                    frm.set_value('confirmed_date', frappe.datetime.now_datetime());
                                    frm.set_value('status', 'Confirmed');

                                    setTimeout(() => { 
                                    frm.events.create_putaway_transfer_task(frm, "Putaway Transfer", null, "Warehouse Picker", frappe.datetime.get_today(), frappe.datetime.now_time() );
                                    }, 1000);

                                    setTimeout(() => { 
                                        frm.save().then(() => {
                                            frappe.utils.play_sound("submit");
                                            frappe.show_alert({
                                            message: __('PO Receipt QAD succesfully'),
                                            indicator: 'green'
                                            });
                                        });
                                    }, 1300);
                                }
                            }
                        });
                    });
                }
                else {
                    frappe.msgprint({
                            title: __('ERROR'),
                            indicator: 'red',
                            message: __('Based on the status document, you are not allowed to receive PO right now')
                    });
                }
            });
        }, __("Receipt & Putaway"));
        
        frm.set_df_property('material_incoming_item', 'cannot_add_rows', true);

 	},

    onload: function(frm) {
        // Menargetkan input po_number
        if (frm.doc.purchase_order) {
            frm.trigger('load_po_history');
        } 


        // Mengatur variabel timer di dalam object frm agar tidak konflik
        frm.typing_timer = null;
        frm.debounce_delay = 1000; // Atur waktu tunggu di sini (1000ms = 1 detik)
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

    fetch_po_from_qad: function(frm){
        frappe.call({
            method: "warehousing.warehousing.allAPI.get_po_from_qad", // Path ke fungsi Python Anda
            args:{po_number: frm.doc.purchase_order, domain: "SMII"}, // Kirim nomor PO sebagai argumen
            freeze: true, // Opsional: Membekukan layar dengan loading spinner
            freeze_message: __("Sedang memproses Purchase Order..."),
                callback: function(r) {
                    if (r.message) {
                        let data = r.message.dsPOResponse;
                        frm.clear_table('material_incoming_item');
                        let this_today = frappe.datetime.get_today();
                        
                        if (data.ttpod_det && data.ttpod_det.length > 0) {
                            data.ttpod_det.forEach(row => {
                                frappe.db.get_single_value('Material Incoming Control', 'strict_when_qty_per_pallet_item_is_zero')
                                .then(value => {
                                    if (value && row.pt_qtypallet == 0){ 
                                        frappe.msgprint(__("Qty per Pallet untuk item {0} tidak boleh nol. Silakan periksa kembali data PO di QAD.", [row.podpart]));
                                        return;
                                    }
                                });

                                let child = frm.add_child('material_incoming_item');
                                child.pod_line = row.podline;
                                child.item_number = row.podpart;
                                child.item_description = row.ptdesc1 + " " + row.ptdesc2;
                                child.um = row.ptum;
                                child.qty_open = row.pod_qtyord - row.pod_qtyrcvd;
                                child.qty_order = row.pod_qtyord;
                                child.qty_received = row.pod_qtyrcvd;
                                child.requisition = row.pod_reqnbr;

                                frappe.db.get_value("Part Master", {"name": row.podpart}, ["qty_per_pallet","expire_date_required"]).then(value => {
                                    if (value.message && value.message.qty_per_pallet){ 
                                        child.qty_per_pallet= value.message.qty_per_pallet;
                                    } 
                                    if (value.message && value.message.expire_date_required){
                                        child.expired_date = frappe.datetime.add_months(this_today, 6);
                                    }
                                });
                                
                            });
                        }

                        if (data.ttpo_mstr && data.ttpo_mstr.length > 0) {
                            let header = data.ttpo_mstr[0];
                            
                            frm.set_value("site", header.posite);
                            frm.set_value("order_date", header.po_orddate);
                            frm.set_value("due_date", header.po_duedate);
                            frm.set_value("supplier", header.povend);
                            frm.set_value("supplier_name", header.name_vend);
                            frm.set_value("supplier_address", + header.line1_vend + "\n" + header.line2_vend + "\n" + header.line3_vend);
                            frm.set_value("shipto", header.addr_ship);
                            frm.set_value("shipto_name", header.name_ship);
                            frm.set_value("shipto_address", header.line1_ship + "\n" + header.line2_ship + "\n" + header.line3_ship);
                        }

                        setTimeout(() => { 
                            frm.refresh_field('material_incoming_item');
                            frm.fields_dict['material_incoming_item'].grid.wrapper.find('.grid-row-checkbox').hide();
                            frm.fields_dict['material_incoming_item'].grid.wrapper.find('.row-check').hide();
                        }, 1000);

                       
                        
                    }
                    else {
                        frappe.msgprint(__("Purchase Order tidak ditemukan."));
                    }
                },
                error: function(r) {
                    frappe.msgprint(__("Terjadi kesalahan saat menghubungi server"));
                }
            });
    },
    full_receipt_for_all_lines(frm) {
        frm.doc.material_incoming_item.forEach(d => {
            if (frm.doc.full_receipt_for_all_lines){
                d.qty_to_receive = d.qty_open;
                d.total_label = Math.ceil(d.qty_to_receive / d.qty_per_pallet);
            }
            else {
                d.qty_to_receive = 0;
                d.total_label = 0;
            }
            frm.refresh_field('material_incoming_item');
            frm.fields_dict['material_incoming_item'].grid.wrapper.find('.grid-row-checkbox').hide();
            frm.fields_dict['material_incoming_item'].grid.wrapper.find('.row-check').hide();
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
            frm.fields_dict['material_incoming_item'].grid.wrapper.find('.grid-row-checkbox').hide();
            frm.fields_dict['material_incoming_item'].grid.wrapper.find('.row-check').hide();
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
            frm.fields_dict['material_incoming_item'].grid.wrapper.find('.grid-row-checkbox').hide();
            frm.fields_dict['material_incoming_item'].grid.wrapper.find('.row-check').hide();
        }); 
    },
 
    create_physical_verification_task: function(frm, task_type, assign_to_person, assign_to_role, date_instruction, time_transaction) {
        frappe.call({
            method: "warehousing.warehousing.doctype.warehouse_task.warehouse_task.create_physical_verification_task", // Memanggil fungsi backend
            args: {
                source_doc: frm.doc.name,
                task_type: task_type, 
                assigned_to_person: assign_to_person,
                assigned_to_role: assign_to_role   
            },
            freeze: true,
            freeze_message: __("Creating Warehouse Task..."),
            callback: function(r) {
                if (r.message.status === "success") {  
                    frm.set_value('pv_assigned_date', frappe.datetime.now_datetime());   
                    frm.set_value('physical_verification_id', r.message.name);
                    frm.set_value('status', 'Asiggned');
                    frm.set_value('person_assigned', assign_to_person);
                    frm.set_value('role_assigned', assign_to_role);
                    frm.set_value('date_instruction_given', date_instruction);
                    frm.set_value('time_instruction_given', time_transaction);
                    frm.save() 
                    // MEMBUKA FORM DALAM POP-UP (Quick Entry Mode)
                    /* frappe.ui.form.make_quick_entry("Warehouse Task", null, null, r.message.name); */
                    
                    /* frappe.show_alert({
                        message: __(r.message.message),
                        indicator: 'green'
                    }); */
                }
            }
        });
    },
    
    create_putaway_transfer_task: function(frm, task_type, assign_to_person, assign_to_role, date_instruction, time_transaction) {
        frappe.call({
            method: "warehousing.warehousing.doctype.warehouse_task.warehouse_task.create_putaway_transfer_task", // Memanggil fungsi backend
            args: {
                source_doc: frm.doc.physical_verification_id,
                task_type: task_type, 
                assigned_to_person: assign_to_person,
                assigned_to_role: assign_to_role   
            },
            freeze: true,
            freeze_message: __("Creating Warehouse Task..."),
            callback: function(r) {
                if (r.message.status === "success") {  
                    frm.set_value('tf_assigned_date', frappe.datetime.now_datetime());   
                    frm.set_value('putaway_transfer_task_id', r.message.name);
                    frm.set_value('status', 'Transferring');
                    frm.set_value('pt_person_assigned', assign_to_person);
                    frm.set_value('pt_role_assigned', assign_to_role);
                    frm.set_value('pt_date_instruction_given', date_instruction);
                    frm.set_value('pt_time_instruction_given', time_transaction);
                    // Simpan dokumen secara otomatis
                    //frm.save() 
                    // MEMBUKA FORM DALAM POP-UP (Quick Entry Mode)
                    //frappe.ui.form.make_quick_entry("Warehouse Task", null, null, r.message.name);
                    
                    //frappe.show_alert({
                    //    message: __(r.message.message),
                    //    indicator: 'green'
                    //});
                }
            }
        });
    },

    load_po_history: function(frm) {
        frappe.call({
            method: "warehousing.warehousing.doctype.material_incoming.material_incoming.get_po_history_with_items",
            args: {
                purchase_order: frm.doc.purchase_order,
                current_doc: frm.doc.name
            },
            callback: function(r) {
                let container = frm.get_field('po_tracking_html').$wrapper;
                
                if (r.message && r.message.length > 0) {
                    let html = `
                        <table class="table table-bordered" style="font-size: 13px;">
                            <thead class="bg-light">
                                <tr>
                                    <th>Info Kedatangan</th>
                                    <th>Item Details</th>
                                </tr>
                            </thead>
                            <tbody>`;

                    r.message.forEach(row => {
                        // Render Baris Item
                        let item_rows = row.items.map(item => `
                            <tr>
                                <td>${item.pod_line}</td>
                                <td>${item.item_number}</td>
                                <td>${item.item_description}</td>
                                <td class="text-right"><strong>${flt(item.qty_to_receive, 3)}</strong></td>
                                <td>${item.um}</td>
                                <td>${item.expired_date || ''}</td>
                            </tr>
                        `).join('');

                        html += `
                            <tr>
                                <td class="bg-light" style="width: 30%;">
                                    <b><a href="/app/material-incoming/${row.name}">${row.name}</a></b><br>
                                    <small>Print & Assign on: ${frappe.datetime.str_to_user(row.pv_assigned_date)}</small><br>
                                    <small>Receipt on: ${frappe.datetime.str_to_user(row.confirmed_date)}</small><br>
                                    <small>Transfer on: ${frappe.datetime.str_to_user(row.tf_assigned_date)}</small>

                                </td>
                                <td style="padding: 0;">
                                    <table class="table table-sm mb-0" style="border:none;">
                                        <tr class="text-muted small">
                                            <th style="width: 5%;">PO Line</th>
                                            <th style="width: 20%;">Item</th>
                                            <th style="width: 40%;">Name</th>
                                            <th style="width: 10%;" class="text-right">Qty</th>
                                            <th style="width: 5%;">UM</th>
                                            <th style="width: 20%;">Expire</th>
                                        </tr>
                                        ${item_rows}
                                    </table>
                                </td>
                            </tr>`;
                    });

                    html += `</tbody></table>`;
                    container.html(html);
                } else {
                    container.html('<div class="text-muted p-3">Belum ada riwayat kedatangan.</div>');
                }
            }
        });
    },

    go_to_verification_task: function(frm) {
        if (frm.doc.physical_verification_id) {    
            // Pindah halaman ke dokumen Warehouse Task spesifik
            frappe.set_route('Form', 'Warehouse Task', frm.doc.physical_verification_id);
            
        } else {
            frappe.msgprint(__('Nomor Warehouse Task tidak ditemukan pada dokumen ini.'));
        }
    },
    go_to_putaway_transfer_task: function(frm) {
        if (frm.doc.putaway_transfer_task_id) {    
            // Pindah halaman ke dokumen Warehouse Task spesifik
            frappe.set_route('Form', 'Warehouse Task', frm.doc.putaway_transfer_task_id);
            
        } else {
            frappe.msgprint(__('Nomor Warehouse Task tidak ditemukan pada dokumen ini.'));
        }
    },

    rerun_putaway_ts: function(frm){
        frm.events.create_putaway_transfer_task(frm, "Putaway Transfer", null, "Warehouse Picker", frappe.datetime.get_today(), frappe.datetime.now_time());    
        setTimeout(() => { 
           frm.save();
        }, 500);
    },


 });

frappe.ui.form.on('Material Incoming Item', {
    qty_to_receive: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (row.qty_to_receive < 0) {
            frappe.msgprint(__('Qty to receive must be greater than 0.'));
            row.qty_to_receive = 0;
            frm.refresh_field('material_incoming_item');
        }
        if (row.qty_per_pallet === null || row.qty_per_pallet <= 0) {
            frappe.msgprint(__('Qty per pallet must be greater than 0 to calculate total labels.'));
            row.total_label = 0;
            row.qty_to_receive = 0;
            frm.refresh_field('material_incoming_item');
    
        }
        if (row.qty_per_pallet && row.qty_per_pallet > 0) {
            frappe.call({
                method: "warehousing.warehousing.doctype.material_incoming.material_incoming.max_qty_receive_allowed",
                args: {
                    order_number: frm.doc.purchase_order,
                    order_line: row.pod_line, 
                    name: frm.doc.name,
                },
                callback: function(r) {
                    if (r.message && r.message.length > 0) {
                       
                        let data = r.message;
                        total_qty_to_receive = 0;
                        data.forEach((row, index) => {
                            total_qty_to_receive += row.qty_to_receive;
                        });
                         
                        
                        frappe.db.get_single_value('Material Incoming Control', 'qty_to_receive_tolerance')
                        .then(value => {
                            if (value){ 
                            
                                qty_receive_allowed = row.qty_order + (row.qty_order * (value/100));
                                qty_max_to_received_allowed = qty_receive_allowed -  (total_qty_to_receive +  row.qty_received)
                     
                                if (total_qty_to_receive + row.qty_received + row.qty_to_receive> qty_receive_allowed){
                                    frappe.msgprint(__("Total Qty to receive for this PO line has exceeded the allowed tolerance. Max allowed: {0} {1} and qty received so far: {2} . Currently you can input qty maximal to receive is: {3}", [qty_receive_allowed, row.um, total_qty_to_receive + row.qty_received, qty_max_to_received_allowed]));

                                    row.qty_to_receive = 0;
                                    row.total_label = 0;
                                    frm.refresh_field('material_incoming_item');
                                    return;
                                }
                            }
                        });
                    }
                    else{
                        frappe.db.get_single_value('Material Incoming Control', 'qty_to_receive_tolerance')
                        .then(value => {
                            if (value){ 
                                qty_receive_allowed = row.qty_order + (row.qty_order * (value/100));
                                qty_max_to_received_allowed = qty_receive_allowed - row.qty_received;
                                if (row.qty_received + row.qty_to_receive> qty_receive_allowed){
                                    frappe.msgprint(__("Total Qty to receive for this PO line has exceeded the allowed tolerance. Max allowed: {0} {1} and qty received so far: {2} . Currently you can input qty maximal to receive is: {3}", [qty_receive_allowed, row.um, row.qty_received, qty_max_to_received_allowed]));

                                    row.qty_to_receive = 0;
                                    row.total_label = 0;
                                    frm.refresh_field('material_incoming_item');
                                    return;
                                }
                            }
                        });
                    }
                }           
            });

            row.total_label = Math.ceil(row.qty_to_receive / row.qty_per_pallet);
            frm.refresh_field('material_incoming_item');
            frm.fields_dict['material_incoming_item'].grid.wrapper.find('.grid-row-checkbox').hide();
            frm.fields_dict['material_incoming_item'].grid.wrapper.find('.row-check').hide();
             return;
        }
    }
});

function sync_filter_item(dialog) {
    let d = dialog || cur_dialog;
    if (!d) return;

    let f_line = (d.get_value("filter_line") || "").toString().toLowerCase().trim();
    let f_item = (d.get_value("filter_item") || "").toString().toLowerCase().trim();
    let f_lot = (d.get_value("filter_lot") || "").toString().toLowerCase().trim();

    let grid = d.get_field('xx_material_incoming_item').grid;

    grid.grid_rows.forEach(row => {
        let row_item = (row.doc.item || "").toString().toLowerCase();
        let row_line = (row.doc.line || "").toString().toLowerCase();
        let row_lot = (row.doc.lotserial || "").toString().toLowerCase();

        let match_item = f_item === "" || row_item.includes(f_item);
        let match_line = f_line === "" || row_line.includes(f_line);
        let match_lot = f_lot === "" || row_lot.includes(f_lot);

        if (match_item && match_line && match_lot) {
            row.wrapper.show();
        } else {
            row.wrapper.hide();
        }
    });
}

function handle_print(data) {
    // 1. Buat konten HTML
    let html_content = `
        <html>
        <head>
            <title>Cetak Label QR Code</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
            <style>
                body { font-family: sans-serif; padding: 20px; }
                .label-box { 
                    width: 300px; 
                    border: 1px solid #333; 
                    padding: 15px; 
                    margin-bottom: 20px; 
                    display: flex;
                    align-items: center;
                    page-break-inside: avoid;
                }
                .info { flex: 1; }
                .qr-code { margin-left: 15px; }
                .item-code { font-weight: bold; font-size: 16px; margin: 0; }
                .lot-no { color: #555; font-size: 12px; }
                @media print {
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <!--<div class="no-print">
                <button onclick="window.print()">Cetak Sekarang</button>
                <hr>
            </div>-->
            
            <div id="labels-container">
                ${data.map((row, index) => `
                    <div class="label-box">
                        <div class="info">
                            <p class="item-code">${row.item}</p>
                            <p>${row.description || ''}</p>
                            <p class="lot-no">Lot/Serial: ${row.lotserial || '-'}</p>
                            <p>Qty: ${row.qty}</p>
                        </div>
                        <div id="qrcode_${index}" class="qr-code"></div>
                    </div>
                `).join('')}
            </div>

            <script>
                // Fungsi untuk generate semua QR Code setelah data dimuat
                window.onload = function() {
                    const selectedData = ${JSON.stringify(data)};
                    
                    selectedData.forEach((item, i) => {
                        // Gabungkan Item Code dan Lot untuk isi QR Code
                        let qrText = item.item + "#" + (item.lotserial || "");
                        
                        new QRCode(document.getElementById("qrcode_" + i), {
                            text: qrText,
                            width: 80,
                            height: 80,
                            colorDark : "#000000",
                            colorLight : "#ffffff",
                            correctLevel : QRCode.CorrectLevel.H
                        });
                    });

                    // Auto-print setelah QR selesai digenerate (opsional)
                    setTimeout(() => { 
                        window.print(); 
                    }, 500);
                };
            </script>
        </body>
        </html>
    `;

    // 2. Buka jendela baru dan tulis kontennya
    const print_window = window.open('', '_blank');
    print_window.document.write(html_content);
    print_window.document.close();
    
}

function print_selected_labels(label_ids) {
    if (!label_ids || label_ids.length === 0) {
        frappe.msgprint("Pilih label terlebih dahulu.");
        return;
    }

    frappe.call({
        method: "warehousing.warehousing.doctype.material_label.material_label.generate_bulk_print_html",
        args: {
            docnames: label_ids,
            doctype: "Material Label"
        },
        freeze: true,
        freeze_message: __("Preparing Labels..."),
        callback: function(r) {
            if (r.message) {
                var win = window.open('', '_blank');
                // Menulis konten secara sinkron agar session cookie tetap terbawa
                win.document.write(r.message); 
                win.document.close();
                
                // Beri waktu lebih lama (2 detik) untuk loading gambar
                setTimeout(function() {
                    win.print();
                }, 2000);
            }
        }
    });
}