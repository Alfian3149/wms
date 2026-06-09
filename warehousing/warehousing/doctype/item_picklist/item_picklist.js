// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt
 
frappe.ui.form.on("Item Picklist", {
    onload(frm) {
        frm.set_df_property('item_picklist_summary', 'cannot_add_rows', true);
        frm.set_df_property('item_picklist_summary', 'cannot_delete_rows', true);
        if (frm.doc.needed_date == undefined){
            frm.set_value("needed_date", frappe.datetime.get_today())
        } 
    },

    before_save: function(frm) {
        if (frm.is_new() && (!frm.doc.select_request || frm.doc.select_request.length === 0)) {
            let child_table = frm.doc.item_picklist_summary || [];
            if (child_table.length === 0) {
                frappe.msgprint({
                    title: __('ERROR'),
                    indicator: 'red',
                    message: __('Please select the item request first in the Select Multiple Request field.')
                });
                frappe.validated = false;
                return;
            }
        }

        /* let selected_rows = frm.fields_dict['item_picklist_summary'].grid.get_selected();
        
        if (selected_rows.length > 0) {
            let child_table = frm.doc.item_picklist_summary || [];
            let all_zero = child_table.every(row => flt(row.quantity_picked) <= 0);

            if (child_table.length === 0 || all_zero) {                        
                frappe.msgprint({
                    title: __('ERROR'),
                    indicator: 'red',
                    message: __('There is no item in the details list. Please running the Get Item Stock first.')
                });
                frappe.validated = false;
            }

            frm.doc.item_picklist_summary.forEach(d => {
                let status = selected_rows.includes(d.name) ? 1 : 0;
                frappe.model.set_value(d.doctype, d.name, 'is_selected', status);
            });
        
        }    */    
    },
 
 	refresh(frm) {
        $(frm.fields_dict['item_picklist_summary'].wrapper).on('click', 'input[type="checkbox"]', function(e) {
            let grid = frm.fields_dict['item_picklist_summary'].grid;
            
            // Ambil baris HTML tempat checkbox diklik
            let $clicked_row = $(this).closest('.grid-row');
            let clicked_name = $clicked_row.attr('data-name');

            // Cari data doc berdasarkan baris yang diklik
            let row_data = frm.doc.item_picklist_summary.find(d => d.name === clicked_name);

            // Validasi: Jika baris yang diklik memiliki quantity <= 0
            if (row_data && flt(row_data.quantity_picked) <= 0) {
                
                // 1. Hentikan event bawaan Frappe agar tidak sempat memasukkan data ke internal array
                e.preventDefault();
                e.stopPropagation();

                // 2. Kembalikan visual checkbox dan row ke kondisi semula (uncheck)
                $(this).prop('checked', false);
                $clicked_row.removeClass('selected');

                // 3. Pastikan status field custom tetap 0
                frappe.model.set_value(row_data.doctype, row_data.name, 'is_selected', 0);

                // 4. Tampilkan pesan error
                frappe.msgprint({
                    title: __('ERROR'),
                    indicator: 'red',
                    message: __('The row you selected has zero quantity. Please select another row with quantity more than zero.')
                });

                return false; 
            }

            // --- LOGIKA JIKA LOLOS VALIDASI (Kuantitas > 0) ---
            // Berikan jeda microsecond agar Frappe selesai memperbarui grid.get_selected() bawaannya
            setTimeout(() => {
                let selected_rows = grid.get_selected();
                
                frm.doc.item_picklist_summary.forEach(d => {
                    let status = selected_rows.includes(d.name) ? 1 : 0;
                    if (d.is_selected !== status && flt(d.quantity_picked) > 0) {
                        frappe.model.set_value(d.doctype, d.name, 'is_selected', status);
                    }
                });
            }, 50);
        });

        frm.events.sync_grid_selection(frm);
        frm.fields_dict['item_picklist_detail'].grid.wrapper.find('.grid-row-checkbox').hide();
        frm.fields_dict['item_picklist_detail'].grid.wrapper.find('.row-check').hide();
        let d = new frappe.ui.form.MultiSelectDialog({ doctype: "Inventory" });
        //d.dialog.hide();

        
        /* frm.fields_dict['item_picklist_summary'].grid.wrapper.on('click', '.grid-row-checkbox', function() {
            alert("test");
            // Berikan sedikit delay agar Frappe selesai mengupdate state grid
            setTimeout(() => {
                let selected_rows = frm.get_field('item_picklist_summary').grid.get_selected();
                alert("Jumlah baris dicentang sekarang:");
                
                // Contoh: Update field total di header berdasarkan baris terpilih
                //update_total_selected(frm, selected_rows);
            }, 100);
        }); */

         //frm.set_df_property('item_picklist_summary', 'read_only', true);
         frm.set_df_property('item_picklist_summary', 'cannot_add_rows', true);
         frm.set_df_property('item_picklist_summary', 'cannot_delete_rows', true);

         frm.set_df_property('item_picklist_detail', 'cannot_add_rows', true);

         frm.fields_dict['item_picklist_detail'].grid.wrapper.find('.grid-row-checkbox').hide();
         frm.fields_dict['item_picklist_detail'].grid.wrapper.find('.row-check').hide();
         frm.set_query('select_request', function() {
            return {
                filters: {
                    'request_status': ['!=', 'Fully Picked'],
                    'status': ['!=', 'Fully Picked'],
                    'docstatus':['!=', '2']
                }
            };
        });
        /* frm.set_query('request_master', 'select_request', function() {
            return {
                filters: {
                    'status': ['=', "Open"]
                }
            };
        }); */
 	},

    sync_grid_selection: function(frm) {
        // Iterasi setiap baris di child table 'items'
        frm.doc.item_picklist_summary.forEach(d => {
            // Jika data is_selected bernilai true (1)
            if (d.is_selected) {
                // Cari index baris berdasarkan nama/ID baris
                let grid_row = frm.fields_dict['item_picklist_summary'].grid.grid_rows_by_docname[d.name];
                
                if (grid_row) {
                    // Berikan centang pada checkbox bawaan secara visual
                    grid_row.select(true);
                }
            }
        });
        
        // Refresh grid untuk memastikan tampilan checkbox terupdate
        frm.fields_dict['item_picklist_summary'].grid.refresh();
    },

	get_item_stock(frm) { 
        if (frm.doc.select_request == undefined || frm.doc.select_request == "") {
            frappe.msgprint({
                title: __('ERROR'),
                indicator: 'red',
                message: __('Please select the item request first in the Select Multiple Request field.')
            });
            return;
        }

        if (frm.is_new()){
            frappe.msgprint({
                title: __('ERROR'),
                indicator: 'red',
                message: __('Please save the document first.')
            });
            return;
        }
        frappe.call({
            method: "warehousing.warehousing.doctype.inventory.inventory.get_fifo_picklist_with_reserved",
            args: {  
                itemPicklistName: frm.doc.name,
                item_status: "P-GOOD"
            },
            freeze: true,
            freeze_message: __("Sedang memproses get items..."),
            callback: function(r) {
                let results = r.message.results;
                let summary = r.message.summary;
                if(!results){
                    frappe.msgprint({
                            title: __('ERROR'),
                            indicator: 'red',
                            message: __('There is no stock available for the request')
                        });
                    return;
                }
                frm.set_df_property('item_picklist_summary', 'cannot_add_rows', true);
                frm.set_df_property('item_picklist_summary', 'cannot_delete_rows', true);
                frm.set_df_property('item_picklist_detail', 'cannot_add_rows', true);
                frm.set_df_property('item_picklist_detail', 'cannot_delete_rows', true);
                

                frm.clear_table('item_picklist_summary');
                frm.clear_table('item_picklist_detail');
                //alert(results);
                summary.forEach(row => {
                    let summary_child = frm.add_child('item_picklist_summary');
                    summary_child.part= row.part;
                    summary_child.site= row.site;
                    summary_child.quantity_requested= row.quantity_requested;
                    summary_child.quantity_picked= row.quantity_picked;
                    summary_child.item_grouping= row.item_group;
                });
                
                results.forEach(row => {
                    let child = frm.add_child('item_picklist_detail');
                    child.site= row.site;
                    child.part= row.part;
                    child.description = row.description;
                    child.um = row.um;
                    child.qty_per_pallet = row.qty_per_pallet;
                    child.lot_serial = row.lot_serial;
                    child.quantity = row.qty;
                    child.amt_pallet = row.amt_pallet;
                    child.conversion_factor = row.conversion_factor;
                    child.um_conversion = row.um_conversion;
                    child.from_location = row.from_location;
                    child.to_location= row.to_location;
                    child.item_grouping= row.item_group;
                });
                frm.refresh_field('item_picklist_summary');
                frm.refresh_field('item_picklist_detail');
                frm.fields_dict['item_picklist_detail'].grid.wrapper.find('.grid-row-checkbox').hide();
                frm.fields_dict['item_picklist_detail'].grid.wrapper.find('.row-check').hide();
            }
        })
        
        
    }, 

    get_item_from_inventory:function(frm){
        if(frm.doc.docstatus == 1){
            frappe.msgprint({
                title: __('ERROR'),
                indicator: 'red',
                message: __('Cannot get item from inventory because the document is already submitted.')
            });
            return;
        } 


        let d = new frappe.ui.form.MultiSelectDialog({
            doctype: "Inventory",
            target: this.cur_frm,
            columns: ["name", "part", "lot_serial", "warehouse_location", "qty_on_hand"],
            setters: {
                part: null, 
                lot_serial: null, 
                warehouse_location: null, 
                qty_on_hand:null,
            },

            action(selections) {
                if (selections.length === 0) {
                    frappe.msgprint(__('Pilih setidaknya satu lokasi.'));
                    return;
                }
                /* else if (selections.length  > 1){
                    frappe.msgprint(__('Hanya bisa pilih 1 baris inventory'));
                    return;
                } */
                // Iterasi setiap lokasi yang dipilih
                selections.forEach(inventory => {
                    frappe.db.get_doc("Inventory", inventory).then(inv => {
                        if (inv.qty_on_hand <= 0){
                            frappe.msgprint(__('Inventory selected does not have stock'));
                            return;
                        }

                        const picklist_details = frm.doc.item_picklist_detail;
                        const item_detail_is_existed = picklist_details.find(row => row.part === inv.part && row.lot_serial === inv.lot_serial && row.from_location === inv.warehouse_location);

                        if (item_detail_is_existed){
                            frappe.msgprint(__('Item with same part {0}, lot serial {1}, and location {2} already exist in the details list').format(inv.part, inv.lot_serial, inv.warehouse_location));
                            return;
                        } 

                        const item_is_existed = picklist_details.find(row => row.part === inv.part);

                        if (item_is_existed){
                            $.each(frm.doc.item_picklist_summary, function(index, row) {
                                if (row.part === inv.part) {
                                    frappe.model.set_value(row.doctype, row.name, 'quantity_picked', flt(row.quantity_picked) + flt(inv.qty_on_hand));
                                }
                            });
                        }
                        else {
                            let summary_child = frm.add_child('item_picklist_summary');
                            summary_child.part= inv.part;
                            summary_child.site= inv.site;
                            summary_child.quantity_requested= 0;
                            summary_child.quantity_picked= flt(inv.qty_on_hand);
                            
                        }
                        
                        let child = frm.add_child('item_picklist_detail');
                        child.site= inv.site;
                        child.part= inv.part;
                        child.quantity = inv.qty_on_hand;
                        child.from_location = inv.warehouse_location;
                        child.lot_serial = inv.lot_serial;
                        child.amt_pallet = 0;

                        frappe.db.get_value("Part Master", inv.part, ["description", "um","qty_per_pallet","item_group"], as_dict=1).then(value => {
                            child.description = value.message.description;
                            child.um = value.message.um;
                            child.qty_per_pallet = value.message.qty_per_pallet;
                            child.item_grouping= value.message.item_group;
                            summary_child.item_grouping= value.message.item_group;
                        })  
                        
                        setTimeout(() => { 
                        frm.refresh_field('item_picklist_summary');
                        frm.refresh_field('item_picklist_detail'); 
                        frm.fields_dict['item_picklist_detail'].grid.wrapper.find('.grid-row-checkbox').hide();
                        frm.fields_dict['item_picklist_detail'].grid.wrapper.find('.row-check').hide();
                        }, 500);
                    
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

frappe.ui.form.on('Item Picklist Summary', {
});

frappe.ui.form.on('Item Picklist Detail', {
    quantity: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        
        if (row.part) {
            update_summary_total(frm, row.part);
        }
    },
    items_remove: function(frm) {
        // Trigger jika ada baris yang dihapus
        calculate_all_summaries(frm);
    }
});


var update_summary_total = function(frm, item_code) {
    let total = 0;

    // 1. Hitung total qty dari detail table untuk item tersebut
    (frm.doc.item_picklist_detail || []).forEach(d => {
        if (d.part === item_code) {
            total += flt(d.quantity);
        }
    });

    // 2. Cari baris yang sesuai di summary table dan update
    let summary_row_found = false;
    (frm.doc.item_picklist_summary || []).forEach(s => {
        if (s.part === item_code) {
            s.quantity_picked = total;
            summary_row_found = true;
        }
    });

    // 3. Refresh field summary table agar perubahan terlihat
    frm.refresh_field('item_picklist_summary');
};

// Fungsi opsional untuk kalkulasi ulang seluruhnya
var calculate_all_summaries = function(frm) {
    let totals = {};
    
    // Kelompokkan semua qty berdasarkan item_code
    (frm.doc.item_picklist_detail || []).forEach(d => {
        if (!totals[d.part]) totals[d.item_code] = 0;
        totals[d.part] += flt(d.quantity);
    });

    // Update semua baris di summary
    (frm.doc.item_picklist_summary || []).forEach(s => {
        s.quantity_picked = totals[s.part] || 0;
    });

    frm.refresh_field('item_picklist_summary');
};