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
        if (!frm.is_new()){
        // Mengambil nama baris (name/ID) yang sedang dicentang di grid
            let selected_rows = frm.fields_dict['item_picklist_summary'].grid.get_selected();
            
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
            
            }
            else{
                frappe.msgprint({
                    title: __('ERROR'),
                    indicator: 'red',
                    message:__("There is no selected item in the request list"),
                });
                frappe.validated = false;
                return;
            }
        }
    },
 
 	refresh(frm) {
        $(frm.fields_dict['item_picklist_summary'].wrapper).on('click', 'input[type="checkbox"]', function() {
            let selected_rows = frm.fields_dict['item_picklist_summary'].grid.get_selected();
            frm.doc.item_picklist_summary.forEach(d => {
                let status = selected_rows.includes(d.name) ? 1 : 0;
                frappe.model.set_value(d.doctype, d.name, 'is_selected', status);
            });
        });

        frm.events.sync_grid_selection(frm);
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