// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Transfer Single Item", {
    before_submit: function(frm) {
        // 1. EVALUASI KONDISI LOGIKA
        let options_list = [];
        let info_text = "";
        let allow_submit = true;
        let needs_dialog = false;
        
        if (frm.doc.part_status !== '0001'){
            frappe.msgprint(__('Item status non active, hanya part status 0001 yang diperbolehkan.'));
            frappe.validated = false;
            return;
        }
        // KONDISI 1 (PRIORITAS UTAMA): ERROR BLOCKER (Expire Berbeda)
        if (frm.doc.expire !== frm.doc.expire_in_destination_location && frm.doc.inventory_status_in_destination_location !== undefined && frm.doc.inventory_status_in_destination_location !== null) {
            console.log("Tanggal kadaluarsa di lokasi asal dan tujuan berbeda, memblokir submit.");
            allow_submit = false;
            needs_dialog = true;
            info_text = `<div class="alert alert-danger small">
                <b>Error:</b> Tanggal kadaluarsa di lokasi asal (${frm.doc.expire || '-'}) berbeda dengan tanggal kadaluarsa di lokasi tujuan (${frm.doc.expire_in_destination_location || '-'}). Dokumen <b>tidak dapat di-submit</b>.
            </div>`;
        }
        // KONDISI 2: STATUS DI LOKASI TUJUAN BERBEDA (Hanya Opsi 'useto')
        else if (frm.doc.inventory_status_in_destination_location !== frm.doc.status && frm.doc.inventory_status_in_destination_location !== undefined && frm.doc.inventory_status_in_destination_location !== null) {
            console.log("Status stok di lokasi asal dan tujuan berbeda, menampilkan opsi useto.");
            needs_dialog = true;
            options_list = [
                { label: 'Gunakan status bawaan dari lokasi tujuan', value: 'useto' }
            ];
            info_text = `<div class="alert alert-info small">
                <b>Informasi:</b><br><br>
                Jika Anda memilih <b>"Gunakan status bawaan dari lokasi tujuan"</b>, maka status stok akan berubah sesuai dengan status bawaan lokasi tujuan yaitu : <b>${frm.doc.inventory_status_in_destination_location || ''}</b>.
            </div>`;
        }
        // KONDISI 3: STATUS ASAL & TARGET LOC STATUS BERBEDA (Opsi 'usefrom' & 'useto')
        else if (frm.doc.status !== frm.doc.target_loc_status) {
            console.log("Status asal dan target_loc_status berbeda, menampilkan opsi pilihan.");
            needs_dialog = true;
            options_list = [
                { label: 'Tetap menggunakan status asal stok', value: 'usefrom' },
                { label: 'Gunakan status bawaan dari lokasi tujuan', value: 'useto' }
            ];
            info_text = `<div class="alert alert-info small">
                <b>Informasi:</b><br><br>
                Jika Anda memilih <b>"Tetap menggunakan status asal stok"</b>, maka status stok akan tetap sama dengan lokasi asal yaitu : <b>${frm.doc.status}</b>.<br><br>
                Jika Anda memilih <b>"Gunakan status bawaan dari lokasi tujuan"</b>, maka status stok akan berubah sesuai dengan status bawaan lokasi tujuan yaitu : <b>${frm.doc.target_loc_status}</b>.
            </div>`;
        }

        // 2. JIKA TIDAK MEMERLUKAN DIALOG (SEMUA KONDISI NORMAL), BISA LANGSUNG SUBMIT
        if (!needs_dialog) {
            return; // Mengizinkan submit bawaan Frappe berlanjut secara normal
        }

        // 3. JIKA MEMERLUKAN DIALOG, TAHAN SUBMIT STANDAR
        frappe.validated = false;

        let d = new frappe.ui.Dialog({
            title: __('Konfirmasi Submit'),
            fields: [
                {
                    label: __('Pilih Metode'),
                    fieldname: 'metode',
                    fieldtype: 'Select',
                    options: options_list,
                    default: options_list.length > 0 ? options_list[0].value : '',
                    hidden: !allow_submit // Sembunyikan jika submit diblokir
                },
                {
                    fieldname: 'info_html',
                    fieldtype: 'HTML',
                    options: info_text
                }
            ],
            primary_action_label: __('Lanjutkan Submit'),
            primary_action(values) {
                if (values.metode) {
                    frm.set_value('use_status', values.metode);
                }
                d.hide();
                frappe.validated = true;
                frm.save('Submit');
            },
            secondary_action_label: __('Tutup'),
            secondary_action() {
                d.hide();
                frappe.validated = false;
            }
        });

        // Kontrol Tombol Submit/Batal
        if (!allow_submit) {
            d.get_primary_btn().hide();
            d.set_secondary_action_label(__('Tutup'));
        }

        d.show();
    },

    onload(frm){
        //frm.dashboard.set_headline("Document is under review", "red");
        frm.set_value("use_status", "usefrom");
        if(frm.is_new()){
            frm.set_df_property('from_to', 'hidden', 1);
        }

        if (frappe.user.has_role('Production Manager') || frappe.user.has_role('Production Operator') || frappe.user.has_role('System Manager')) {
            frm.set_df_property('sent_the_transfer_action_to_qc_tim', 'hidden', 0);
            frm.set_value('sent_the_transfer_action_to_qc_tim', 1);
        }

        if (frm.is_new() && frm.doc.__islocal && !frm.doc.__unsaved) {
             frm.trigger('get_inventory');
        }

    },

    /* onload_post_render(frm){
    }, */
    
    refresh(frm) {
        let d = new frappe.ui.form.MultiSelectDialog({ doctype: "Inventory",target: this.cur_frm});

        if (frm.is_new() && frm.doc.__islocal) {
            setTimeout(() => {
                frm.trigger('get_inventory');
            }, 500);
        } 
        let key_name_filter = "";

        if (frappe.user.has_role('Warehouse Manager') || frappe.user.has_role('System Manager')) {
            key_name_filter = 'TFS_REASON_FOR_WAREHOUSE';
        } 
        else if (frappe.user.has_role('Production Manager') || frappe.user.has_role('Production Operator')) {
            key_name_filter = 'TFS_REASON_FOR_PRODUCTION';
        }

        // 2. Jika role cocok dan key_name_filter terisi, terapkan set_query sekali saja
        if (key_name_filter) {
            frm.set_query('reason', function() {
                return {
                    filters: {
                        'key_name': key_name_filter
                    }
                };
            });
        }

        frm.set_query('location_to', function() {
            return {
                filters: {
                    // filter data kamu di sini jika ada
                    'docstatus': 0
                },
                // Mencoba memaksa urutan berdasarkan field tertentu
                order_by: 'name DESC' 
            };
        });

    },

    location_to(frm) {
        frm.scroll_to_field('reason');
        frappe.db.get_value('Inventory', { 
            'site' : frm.doc.site, 
            'part' : frm.doc.part, 
            'lot_serial' : frm.doc.lotserial_from, 
            'warehouse_location' : frm.doc.location_to, 
            'qty_on_hand' : ['>', 0]
        }, ['inventory_status', 'expire_date'])
        .then(r => {
            if (r.message) {
                frm.set_value('expire_in_destination_location', r.message.expire_date);
                frm.set_value('inventory_status_in_destination_location', r.message.inventory_status);
            }
        });

    },

    get_inventory:function(frm){

        let d = new frappe.ui.form.MultiSelectDialog({
            doctype: "Inventory",
            target: this.cur_frm,
            columns: ["name", "part", "lot_serial", "warehouse_location", "qty_on_hand"],
            setters: {
                part: frm.doc.part ? frm.doc.part : null , 
                lot_serial: null, 
                warehouse_location: frappe.user.has_role('Production Manager') || frappe.user.has_role('Production Operator') || frappe.user.has_role('System Manager') ?  "WH04" : null, 
                qty_on_hand:null,
                inventory_status:null,
            }, 
           /*  get_query() {
                return {
                    filters: [{qty_on_hand: [">", 0]}]
                };
            },   */ 
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
                        frm.set_value('quantity', doc.qty_on_hand);
                        frm.set_value('status', doc.inventory_status);
                        frm.set_value('expire', doc.expire_date);
                        frm.set_value('inventory_name', doc.name);


              
                    });
                });

                d.dialog.hide();
                frm.scroll_to_field('location_to');

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
