// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Purchase Order Receipt", {
    refresh(frm) {
        frm.fields_dict['purchase_order'].$input.on('blur', function() {
            if (frm.doc.purchase_order !== frm.doc.purchase_order_old && frm.doc.docstatus == 0) { 
                setTimeout(() => { 
                    frm.trigger('fetch_po_from_qad');
                }, 300);   
            }
        });

        frm.set_df_property('purchase_order_receipt_item', 'cannot_add_rows', true);
        frm.fields_dict['purchase_order_receipt_item'].grid.wrapper.find('.grid-row-checkbox').hide();
        frm.fields_dict['purchase_order_receipt_item'].grid.wrapper.find('.row-check').hide();
    },

    before_Save(frm){
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
    /* before_save(frm, cdt, cdn){
        let row = locals[cdt][cdn];
        frm.doc.purchase_order_receipt_item(dt => {
            if (!dt.location_to_receive){
                frappe.model.set_value(row.doctype, row.name, 'location_to_receive', frm.doc.location_receipt);
            }
        })
    },
 */
    fetch_po_from_qad: function(frm){
        frappe.call({
            method: "warehousing.warehousing.allAPI.get_po_from_qad", // Path ke fungsi Python Anda
            args:{po_number: frm.doc.purchase_order, domain: "SMII"}, // Kirim nomor PO sebagai argumen
            freeze: true, // Opsional: Membekukan layar dengan loading spinner
            freeze_message: __("Sedang memproses Purchase Order..."),
                callback: function(r) {
                    if (r.message) {
                        let data = r.message.dsPOResponse;
                        console.log(data);
                        frm.clear_table('purchase_order_receipt_item');
                        let this_today = frappe.datetime.get_today();
                        
                        if (data.ttpod_det && data.ttpod_det.length > 0) {
                            data.ttpod_det.forEach(row => {

                                let child = frm.add_child('purchase_order_receipt_item');
                                child.po_line = row.podline;
                                child.part_number = row.podpart;
                                child.description = row.ptdesc1 + " " + row.ptdesc2;
                                child.um = row.ptum;
                                child.qty_open = row.pod_qtyord - row.pod_qtyrcvd;
                                child.qty_order = row.pod_qtyord;
                                child.qty_received = row.pod_qtyrcvd;                 
                                child.qty_to_receive = flt(0);                 
                                child.item_type = row.podtype;                 
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
                        }

                        setTimeout(() => { 
                            frm.refresh_field('purchase_order_receipt_item');
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

frappe.ui.form.on("Purchase Order Receipt Item", {
    qty_to_receive: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        let qty_receive_allowed = 0;
        let max_qty_to_receive = 0;
        if (row.qty_to_receive > row.qty_open){
            frappe.db.get_single_value('Material Incoming Control', 'qty_to_receive_tolerance')
                .then(value => {
                    if (value){ 
                        qty_receive_allowed = row.qty_order + (row.qty_order * (value/100));
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
          
        }
    }
})

var reset_row_qty = function(row) {
    row._resetting = true;
    frappe.model.set_value(row.doctype, row.name, 'qty_to_receive', undefined);
    setTimeout(() => { delete row._resetting; }, 50);
};

