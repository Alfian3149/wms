// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Purchase Order Receipt", {
    on_submit: function(frm) {
        frm.refresh_field('purchase_order_receipt_item');
        frm.reload_doc();
        setTimeout(() => {              
            frm.refresh_field('purchase_order_receipt_item');
            frm.set_df_property('purchase_order_receipt_item', 'cannot_add_rows', true);
            frm.fields_dict['purchase_order_receipt_item'].grid.wrapper.find('.row-index').hide();
            frm.fields_dict['purchase_order_receipt_item'].grid.wrapper.find('.grid-row-checkbox').hide();
            frm.fields_dict['purchase_order_receipt_item'].grid.wrapper.find('.row-check').hide();
        }, 200); 
    },

    onload(frm){
        setTimeout(() => {              
            frm.refresh_field('purchase_order_receipt_item');
                    frm.set_df_property('purchase_order_receipt_item', 'cannot_add_rows', true);
        frm.fields_dict['purchase_order_receipt_item'].grid.wrapper.find('.row-index').hide();
        frm.fields_dict['purchase_order_receipt_item'].grid.wrapper.find('.grid-row-checkbox').hide();
        frm.fields_dict['purchase_order_receipt_item'].grid.wrapper.find('.row-check').hide();
        }, 300); 

    },
    refresh(frm) {
        if (!frm.doc.ship_date){
            frm.set_value("ship_date", frappe.datetime.get_today());
        }
        if (!frm.doc.transaction_date){
            frm.set_value("transaction_date", frappe.datetime.get_today());
        }
        if (!frm.doc.receipt_date){
            frm.set_value("receipt_date", frappe.datetime.get_today());
        }
        frm.fields_dict['purchase_order'].$input.on('blur', function() {
            if (frm.doc.purchase_order !== frm.doc.purchase_order_old && frm.doc.docstatus == 0) { 
                setTimeout(() => { 
                    frm.trigger('fetch_po_from_qad');
                }, 300);   
            }
        });
        
        /* setTimeout(() => {              
            frm.refresh_field('purchase_order_receipt_item');
        }, 500); 
        frm.set_df_property('purchase_order_receipt_item', 'cannot_add_rows', true);
        frm.fields_dict['purchase_order_receipt_item'].grid.wrapper.find('.row-index').hide();
        frm.fields_dict['purchase_order_receipt_item'].grid.wrapper.find('.grid-row-checkbox').hide();
        frm.fields_dict['purchase_order_receipt_item'].grid.wrapper.find('.row-check').hide(); */
    },

    before_save(frm){
        let all_zero = frm.doc.purchase_order_receipt_item.every(row => row.qty_to_receive === 0);
        if (all_zero){
            frappe.msgprint({
                title: __('ERROR'),
                indicator: 'red',
                message: __('There is no Qty to receive filled.')
            });
            e.preventDefault();
            e.stopPropagation();
        }       
    },

    fetch_po_from_qad: function(frm){
        frappe.call({
            method: "warehousing.warehousing.doctype.purchase_order_receipt.purchase_order_receipt.getPurchaseOrderList",
            args: {
                domain : frm.doc.domain,
                purchase_order: frm.doc.purchase_order,
                trans_type: 'NON-MATERIAL'
            },
            freeze: true, 
            freeze_message: __("Sedang memproses Purchase Order..."),
                callback:  function(r) {
                    if (r.message) {
                        let data = r.message.dsPOResponse;
                       
                        if (!data.ttpod_det){
                            frappe.msgprint(__("Tidak terdapat item sparepart dan jasa pada purchase order ini. Silahkan input nomor order lainnya."));
                            return;
                        }
                   
                        frm.clear_table('purchase_order_receipt_item');
                        let this_today = frappe.datetime.get_today();
                        let type = '';
                        if (data.ttpod_det && data.ttpod_det.length > 0) {
                            data.ttpod_det.forEach(async row => {

                                let child = frm.add_child('purchase_order_receipt_item');
                                child.po_line = row.podline;
                                child.part_number = row.podpart;
                                child.description = row.ptdesc1 + " " + row.ptdesc2;
                                child.um = row.ptum;
                                
                                child.qty_open = row.pod_qtyopen;
                                child.qty_order = row.pod_qtyord;
                                child.qty_received = row.pod_qtyrcvd;
                                child.has_returned = row.pod_qtyrtnd;
                                child.ln_status = row.podstatus;
                                child.qty_to_receive = flt(0);
                                child.item_type = row.pt_grouping;
                                type = row.pt_grouping;

                                let response = await frappe.db.get_value(
                                    'PO Receipt Transaction Type',
                                    type, 
                                    'auto_lot_serial'  // Fieldname target
                                );
                                
                                if (response && response.message) {
                                    child.is_suggest_lot = response.message.auto_lot_serial;
                                    if(response.message.auto_lot_serial){
                                        child.lot_serial = getLotSerialDate();

                                    }
                                }
                            });
                        }

                        if (data.ttpo_mstr && data.ttpo_mstr.length > 0) {
                            let header = data.ttpo_mstr[0];
                            
                            frm.set_value("purchase_order_old", frm.doc.purchase_order);
                            frm.set_value("site", header.posite);
                            frm.set_value("order_date", header.po_orddate);
                            frm.set_value("due_date", header.po_duedate);
                            frm.set_value("supplier", header.povend);
                            frm.set_value("supplier_name", header.name_vend);
                            frm.set_value("supplier_address", + header.line1_vend + "\n" + header.line2_vend + "\n" + header.line3_vend);
                            frm.set_value("shipto", header.addr_ship);
                            frm.set_value("shipto_name", header.name_ship);
                            frm.set_value("shipto_address", header.line1_ship + "\n" + header.line2_ship + "\n" + header.line3_ship);
                            frm.set_value("type", type);
                        }
                       
                    
                        setTimeout(() => {   
                             frm.refresh_field('purchase_order_receipt_item');
                            
                            frm.set_df_property('purchase_order_receipt_item', 'cannot_add_rows', true);
                            frm.fields_dict['purchase_order_receipt_item'].grid.wrapper.find('.row-index').hide();
                            frm.fields_dict['purchase_order_receipt_item'].grid.wrapper.find('.grid-row-checkbox').hide();
                            frm.fields_dict['purchase_order_receipt_item'].grid.wrapper.find('.row-check').hide();
                        }, 500);   
                        
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
});

function getLotSerialDate(date = new Date()) {
    const day = String(date.getDate()).padStart(2, '0');
    // getMonth() dimulai dari 0 (Januari = 0), jadi perlu ditambah 1
    const month = String(date.getMonth() + 1).padStart(2, '0');
    // slice(-2) mengambil 2 digit terakhir dari tahun (misal 2026 -> 26)
    const year = String(date.getFullYear()).slice(-2);

    return `${day}${month}${year}`;
}


/* function toggle_child_column(frm) {
    let fields_to_disable = ['lot_serial', 'reference', 'expire', 'itm_rcpt_status'];
    let is_disabled = frm.doc.type === 'Memo' ? 1 : 0;

    let child_table_fieldname = 'purchase_order_receipt_item'; 

    fields_to_disable.forEach(field => {
        frm.get_field(child_table_fieldname).grid.update_docfield_property(
            field,
            'read_only',
            is_disabled
        );
    });
     

     let child_fieldname = 'purchase_order_receipt_item'; 

    setTimeout(() => { 
    frm.refresh_field(child_fieldname);
    }, 100);   

    
} */

frappe.ui.form.on("Purchase Order Receipt Item", {
    /* item_type: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        
        // Atur status read_only pada field lotserial untuk baris ini
        frappe.model.set_df_property(cdt, cdn, 'lot_serial', 'read_only', 
            row.item_type === 'Memo' ? 1 : 0
        );
        frappe.model.set_df_property(cdt, cdn, 'expire', 'read_only', 
            row.item_type === 'Memo' ? 1 : 0
        );
        frm.refresh_field('purchase_order_receipt_item');
    },
 */
    item_type: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row.is_suggest_lot) {
            frappe.model.set_value(cdt, cdn, 'lot_serial', getLotSerialDate());
        } else {
            frappe.model.set_value(cdt, cdn, 'lot_serial', '');
        }
        frm.refresh_field('purchase_order_receipt_item');
    },

    form_render: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        frappe.model.set_df_property(cdt, cdn, 'lot_serial', 'read_only', 
            row.item_type === 'Memo' ? 1 : 0
        );
        frappe.model.set_df_property(cdt, cdn, 'expire', 'read_only', 
            row.item_type === 'Memo' ? 1 : 0
        );
    },

    qty_to_receive: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        console.log(row);
        let qty_receive_allowed = 0;
        let max_qty_to_receive = 0;
        if (row.qty_to_receive !== 0 && (row.ln_status == 'x' || row.ln_status == 'c') ){ 
            reset_row_qty(row);
            frappe.msgprint({
                title: __('ERROR'),
                indicator: 'red',
                message: __('Status line is cancelled or closed you cannot receive more quantity' )
            });
            e.preventDefault();
            e.stopPropagation();

        }

        qty_receive_allowed = row.qty_order ;
        max_qty_to_receive = qty_receive_allowed - row.qty_received ;
        if(qty_receive_allowed < row.qty_received  + row.qty_to_receive){
            reset_row_qty(row); 
            frappe.msgprint({
                title: __('ERROR'),
                indicator: 'red',
                message: __('Qty to receive cannot greater than qty that allowed to input. Max input for qty to receive is {0} {1}', [flt(max_qty_to_receive), row.um] )
            });
            return;

        }

    }
})

var reset_row_qty = function(row) {
    row._resetting = true;
    frappe.model.set_value(row.doctype, row.name, 'qty_to_receive', 0);
    setTimeout(() => { delete row._resetting; }, 50);
};

