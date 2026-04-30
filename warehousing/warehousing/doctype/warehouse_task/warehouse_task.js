// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Warehouse Task", {
 	refresh(frm) {
        
        if (frm.doc.task_type === "Putaway Transfer"){
            frm.trigger('warehouse_task_detail');
        }
        toggle_summary_section(frm);
        fetch_po_from_material_incoming(frm);
        frm.toggle_display('po_number', frm.doc.task_type === 'Physical Verification');
        // Cek jika dokumen sudah disimpan dan statusnya 'Completed'
        if (frm.doc.status === 'Completed') {
            
            // 1. Sembunyikan tombol Submit bawaan (jika ada)
            //frm.disable_save(); 
            
            frm.add_custom_button(__('Display JSON'), function() {
                frappe.call({
                    method: "warehousing.warehousing.allAPI.po_receipt_JSON_Display",
                    args: {
                        parent_doc_name: cur_frm.doc.name,
                        material_incoming_name: cur_frm.doc.reference_name
                    },
                    freeze: true,
                    freeze_message: __("Sedang memproses PO Receipt JSON..."),
                    callback: function(r) {
                        if (r.message) {
                            frappe.show_alert({ message: __(r.message.message), indicator: 'green' });
                            dialog.hide();
                        }
                    }
                });
            }).addClass("btn-warning").removeClass("btn-default");
            // 2. Tambahkan tombol kustom "PO Receipt Confirm"
            frm.add_custom_button(__('PO Receipt Confirm'), function() {
                
                // Konfirmasi ke user sebelum eksekusi
                frappe.confirm('Apakah Anda yakin ingin melakukan PO Receipt Confirmation ke QAD?', () => {
                   frappe.call({
                        method: "warehousing.warehousing.allAPI.po_receipt_confirmation",
                        args: {
                            parent_doc_name: cur_frm.doc.name,
                            material_incoming_name: cur_frm.doc.reference_name
                        },
                        freeze: true,
                        freeze_message: __("Sedang memproses PO Receipt Confirmation..."),
                        callback: function(r) {
                            if (r.message.status === "failed") {
                                frappe.show_alert({ message: __(r.message.message), indicator: 'red' });
                                dialog.hide();
                            }
                        }
                    });
                });

            }).addClass("btn-warning").removeClass("btn-default");
        }
 	},
    task_type: function(frm) {
        // Menampilkan atau menyembunyikan field po_number secara manual
        frm.toggle_display('po_number', frm.doc.task_type === 'Physical Verification');
    },

    warehouse_task_detail: function(frm, cdt, cdn) {
        // Jika user mengklik baris untuk membuka popup edit
        let row = locals[cdt][cdn];
        if (row.transferred) {
            // Mengunci semua field di dalam popup
            frm.fields_dict['warehouse_task_details'].grid.wrapper
                .find(`[data-name="${cdn}"]`).find('.grid-static-col').addClass('not-editable');
                
            // Atau kunci field spesifik secara eksplisit
            frm.get_field('warehouse_task_detail').grid.get_field('item_code').get_query = function() {
                return { filters: { 'name': ['=', ''] } }; // Mematikan pencarian
            };
        }
        /* frappe.model.set_value(row.doctype, row.name, 'executor', frappe.session.user);
        if (!row.executor){
            frappe.model.set_value(row.doctype, row.name, 'executor', frappe.session.user);
            frappe.model.set_value(row.doctype, row.name, 'pic_execution', frappe.datetime.now_datetime());
        } */

    }
});

// Trigger saat ada perubahan di Child Table 'Warehouse Task Detail'
frappe.ui.form.on('Warehouse Task Detail', {
    // Trigger saat field 'status' di baris tabel diubah
    status: function(frm, cdt, cdn) {
        update_parent_status(frm);
    },
    // Trigger saat baris dihapus
    warehouse_task_detail_remove: function(frm) {
        update_parent_status(frm);
    },
    // Trigger saat baris ditambah
    warehouse_task_detail_add: function(frm) {
        update_parent_status(frm);
    },

});


// Fungsi pembantu untuk mengecek status semua baris
var update_parent_status = function(frm) {
    let details = frm.doc.warehouse_task_detail || [];
    
    if (details.length === 0) {
        frm.set_value('status', 'Pending');
        return;
    }
    // Cek apakah semua status di baris adalah 'Complete'
    let all_complete = details.every(row => row.status === 'Completed');

    if (all_complete) {
        frm.set_value('status', 'Completed');
    } else {
        // Jika ada satu saja yang belum complete, set ke In Progress
        frm.set_value('status', 'In Progress');
    }
};

frappe.ui.form.on('Warehouse Task Detail', {
    qty_confirmation: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row._resetting) return;
        check_discrepancy(frm, row, function() {
            target_location_confirmation(frm, row);
            frappe.model.set_value(row.doctype, row.name, 'executor', frappe.session.user);
            frappe.model.set_value(row.doctype, row.name, 'execution_time', frappe.datetime.now_datetime());
            frm.refresh_field('warehouse_task_detail');
        });
    },

    has_handovered: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row.has_handovered) {
            frappe.model.set_value(row.doctype, row.name, 'time_handovered', frappe.datetime.now_datetime());
            frappe.model.set_value(row.doctype, row.name, 'user_handovered', frappe.session.user);
        } else {
            frappe.model.set_value(row.doctype, row.name, 'time_handovered', null);
            frappe.model.set_value(row.doctype, row.name, 'user_handovered', null);
        }
    }
});


var check_discrepancy = function(frm, row, callback) {
    if (row.qty_confirmation > row.qty_label){
        reset_row_qty(row); 
        frappe.msgprint('Quantity confirmation cannot be greater than Qty Label.');
        return;
    }
    if (row.qty_confirmation != undefined && row.qty_confirmation !== row.qty_label) {
        let is_saved = false;
        let d = new frappe.ui.Dialog({
            title: 'Quantity Discrepancy Detected',
            fields: [
                {
                    label: 'Qty to confirm',
                    fieldname: 'qty_confirm',
                    fieldtype: 'Float',
                    default: row.qty_confirmation,
                    read_only: 1,
                },               
                {
                    
                    label: 'Select Reason for Qty Discrepancy',
                    fieldname: 'reason',
                    fieldtype: 'Link',
                    options: "Reason Master",
                    default: "",
                    reqd: 1,
                    get_query: () => {
                        return {
                            filters: {
                                "key_name": "TASKING_REASON" // Ganti dengan fieldname kategori di Part Master
                            }
                        };
                    }
                },
                {
                    label: 'Remarks (Opsional)',
                    fieldname: 'remark',
                    fieldtype: 'Small Text'
                }
            ],
            primary_action_label: 'Confirm',
            primary_action(values) {
                is_saved = true; 
                frappe.model.set_value(row.doctype, row.name, 'discrepancy_reason', values.reason);         
                if(values.remark) {
                    frappe.model.set_value(row.doctype, row.name, 'remark', values.remark);
                }
                d.hide();
                if (callback) callback();
            },
            secondary_action_label: 'Cancel',
            secondary_action() {    
                frappe.msgprint('Quantity confirmation has been reset. Please verify the quantity and target location again.');
                d.hide();
                reset_row_qty(row);
            },
            on_hide: function() {
                if (!is_saved) {
                    //frappe.msgprint('on hide triggered, resetting qty_confirmation');
                    reset_row_qty(row);
                }
            
            },
        });
        d.show();
      
    } else {
        if (callback) callback();
    }
};

var target_location_confirmation = function(frm, row) {
    let location_saved = false;
    let locDestination = "";
    let locSuggest = row.locationsuggestion;
    if (!locSuggest){
        locSuggest = row.locationdestination;
    }

    if (frm.doc.task_type === "Physical Verification"){
        locDestination = row.locationdestination;
    }
    //alert(row.locationdestination);
    let e = new frappe.ui.Dialog({
        title: 'Target Location Confirmation',
        fields: [
            {
                label: 'Suggestion Location',
                fieldname: 'suggestion_location',
                fieldtype: 'Data',
                default:locSuggest,
                read_only:1 
            },
            {
                label: 'Target Location Confirmation',
                fieldname: 'target_location',
                fieldtype: 'Link',
                options: "Warehouse Location",
                default: locDestination,
                reqd: 1,
                get_query: () => {
                    return {
                        filters: {
                            "is_group": 0 // Filter lokasi berdasarkan gudang sumber
                        }
                    };
                }
                
            },

        ],
        primary_action_label: 'Confirm',
        primary_action(values) {
            if (values.target_location == row.locationsource) {
                frappe.msgprint('Target location is the same as source location. Please verify the location before confirming.', 'Error', 'red');
                return;
            }      
            location_saved = true;
            
            frappe.model.set_value(row.doctype, row.name, 'locationdestination', values.target_location);
            frappe.model.set_value(row.doctype, row.name, 'status', 'Completed');
            frappe.model.set_value(row.doctype, row.name, 'verified', 1);
            e.hide();
            setTimeout(() => { frm.save(); }, 50);
        },
        on_hide: function() {
            if (!location_saved) {
                //frappe.msgprint('on hide triggered, resetting qty_confirmation');
                reset_row_qty(row);
            }
        
        },
    });

    e.show();
};

// Fungsi Helper agar tidak repot
var reset_row_qty = function(row) {
    row._resetting = true;
    frappe.model.set_value(row.doctype, row.name, 'qty_confirmation', undefined);
    setTimeout(() => { delete row._resetting; }, 50);
};



function fetch_po_from_material_incoming(frm) {
    // Hanya jalankan jika Task Type sesuai dan Reference Name sudah terisi
    if (frm.doc.task_type === "Physical Verification" && frm.doc.reference_name) {
        frappe.db.get_value('Material Incoming', frm.doc.reference_name, 'purchase_order', (r) => {
            if (r && r.purchase_order) {
                frm.set_value('po_number', r.purchase_order);
            } else {
                // Opsional: Kosongkan jika tidak ditemukan
                frm.set_value('po_number', '');
            }
        });
        
    } else {
        // Kosongkan field jika kondisi tidak terpenuhi
        frm.set_value('po_number', '');
    }
}

function toggle_summary_section(frm) {
    // Memunculkan atau menyembunyikan section berdasarkan status
    if (frm.doc.status === 'Completed') {
        frm.set_df_property('summary_result_section', 'hidden', 0);
    } else {
        frm.set_df_property('summary_result_section', 'hidden', 1);
    }
}