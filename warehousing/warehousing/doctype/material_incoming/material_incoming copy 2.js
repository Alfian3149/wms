// Copyright (c) 2025, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Material Incoming", {
    onload: function(frm) {
        // Mengatur variabel timer di dalam object frm agar tidak konflik
        frm.typing_timer = null;
        frm.debounce_delay = 1000; // Atur waktu tunggu di sini (1000ms = 1 detik)
    },

 	refresh(frm) {
        // Menargetkan input po_number
        frm.fields_dict['purchase_order'].$input.on('blur', function() {
            // Hapus timer sebelumnya setiap kali tombol ditekan
            //clearTimeout(frm.typing_timer);
            if (frm.doc.purchase_order) {
                frm.trigger('fetch_po_from_qad');
            }
            // Mulai hitung mundur baru
            /* frm.typing_timer = setTimeout(() => {
                let value = frm.doc.purchase_order;

                if (value && value.length >= 2) {
                    frm.trigger('fetch_po_from_qad');
                }
            }, frm.debounce_delay); */
        });

        let ds = frm.doc.docstatus;
        frm.set_value("transaction_date", frappe.datetime.get_today())
    
        frm.add_custom_button(__("Print & Update Label"), function(){
            if (ds === 0) {
                frappe.msgprint({
                    title: __('ERROR'),
                    indicator: 'red',
                    message: __('Please submit the document before print and update label.')
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
                        onchange: () => sync_filter()
                    },
                    {
                        fieldtype: "Column Break"
                    },
                    {
                        label: __("Item"),
                        fieldname: "filter_item",
                        fieldtype: "Link",
                        options: "Part Master",
                        onchange: () => sync_filter_item()
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
                    selected_data = selected_rows;
                    handle_print(selected_data);
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
                order_by: 'line asc'
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
        }).addClass("btn-warning").removeClass("btn-default");

        frm.add_custom_button(__("Assign Task"), function(){
            if (ds === 0) {
                frappe.msgprint({
                    title: __('ERROR'),
                    indicator: 'red',
                    message: __('Please submit the document before asigning a task.')
                });
                return;
            }
            //frm.events.create_picker_task(frm);
            let d = new frappe.ui.Dialog({
                title: __('CREATE TASK FOR PHYSICAL VERIFICATION'),
                fields: [
                    {
                        label: __('Task Type'),
                        fieldname: 'task_type',
                        fieldtype: 'Select',
                        options: ['Picking', 'Physical Verification', 'Stock Transfer', 'Putaway'],
                        default: 'Physical Verification',
                        columns: 10,
                        read_only: 1
                    },
                    {
                        fieldtype: 'Section Break'
                    },
                    {
                        label: __('Assign To Person'),
                        fieldname: 'assign_to_person',
                        fieldtype: 'Link',
                        options: 'User',
                        columns: 10,
                    },
                    {
                        label: __('Date Instruction'),
                        fieldname: 'date_instruction',
                        fieldtype: 'Date',
                        columns: 6,
                        default: frappe.datetime.get_today()
                    },
                    {
                        fieldtype: 'Column Break'
                    },
        
                    { 
                        label: __('Assign To Role'),
                        fieldname: 'assign_to_role',
                        fieldtype: 'Link',
                        options: 'Role',
                        columns: 6
                    },
                    {
                        label: __('Time'),
                        fieldname: 'time',
                        fieldtype: 'Time',
                        columns: 6,
                        default: frappe.datetime.now_time()
                    }
                ],
                size: 'medium',
                primary_action_label: __('SAVE'),
                primary_action(values) {
                    frappe.db.get_value('Warehouse Task', {'reference_name': cur_frm.doc.name, 'docstatus': ['!=', 2]}, 'name')
                    .then(r => {
                        if (r.message.name) {
                            msgprint({
                                title: __('ERROR'),
                                indicator: 'red',
                                message: __('A task for this document already exists: {0}', [r.message.name])
                            });

                            return; 
                        }
                        else{
                            frm.events.create_picker_task(frm, values.task_type, values.assign_to_person, values.assign_to_role);
                             d.hide();
                        }
                    });

                   

                    
                }
            });
        
            /* d.on_page_show = function() {
                d.$wrapper.find('.frappe-control').css({
                    'display': 'flex',
                    'flex-direction': 'column',
                    'align-items': 'flex-start'
                });
            }; */

            /*  d.get_primary_btn().css({
                'background-color': 'black',
                'color': 'white',
                'border-radius': '20px',
                'padding': '8px 40px',
                'font-weight': 'bold'
            });
            */
            d.show();
    
            
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

    fetch_po_from_qad: function(frm){
        frappe.call({
            method: "warehousing.warehousing.api.getPurchaseOrder", // Path ke fungsi Python Anda
            args:{po_number: frm.doc.purchase_order, domain: "SMII"}, // Kirim nomor PO sebagai argumen
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
                            
                            frm.clear_table('material_incoming_item');

                            data.line_detail.forEach(d => {
                                let row = frm.add_child('material_incoming_item');
                                
                                $.extend(row, {
                                    pod_line: d.pod_line,
                                    item_number: d.item_number,
                                    um: d.um,
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

    create_picker_task: function(frm, task_type, assign_to_person, assign_to_role) {
        frappe.call({
            method: "warehousing.warehousing.doctype.warehouse_task.warehouse_task.create_warehouse_task", // Memanggil fungsi backend
            args: {
                source_doc: frm.doc.name,
                task_type: task_type, 
                assigned_to_person: assign_to_person,
                assigned_to_role: assign_to_role   
            },
            freeze: true,
            freeze_message: __("Creating Warehouse Task..."),
            callback: function(r) {
                if (r.message) {
                    // MEMBUKA FORM DALAM POP-UP (Quick Entry Mode)
                    frappe.ui.form.make_quick_entry("Warehouse Task", null, null, r.message);
                    
                    frappe.show_alert({
                        message: __('Task created and opened'),
                        indicator: 'green'
                    });
                }
            }
        });
    }

 });

frappe.ui.form.on('Material Incoming Item', {
    qty_to_receive: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        row.total_label = Math.ceil(row.qty_to_receive / row.item_net_weight);
        frm.refresh_field('material_incoming_item');
    }
});

function sync_filter_item() {
    // Ambil nilai filter dan bersihkan spasi
    msgprint("Filtering by Item...");
    //let f_line = (dialog.get_value("filter_line") || "").toString().trim();
    let f_item = (dialog.get_value("filter_item") || "").toLowerCase().trim();

    let grid = dialog.get_field('xx_material_incoming_item').grid;
    msgprint(f_item);
    grid.grid_rows.forEach(row => {
        let row_item = (row.doc.item || "").toLowerCase();
        let match_item = f_item === "" || row_item.includes(f_item);

        if (match_item) {
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

