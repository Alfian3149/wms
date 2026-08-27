// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Purchase Order Return", {
    refresh(frm) {
        if (!frm.doc.eff_date){
            frm.set_value("eff_date", frappe.datetime.get_today());
        }
        frm.fields_dict['purchase_order'].$input.on('blur', function() {
            if (frm.doc.purchase_order !== frm.doc.purchase_order_old && frm.doc.docstatus == 0) { 
                setTimeout(() => { 
                    frm.trigger('fetch_po_from_qad');
                }, 300);
            }
        });

         $(frm.fields_dict['purchase_order_line_item'].wrapper)
            .off('click', '.grid-row')
            .on('click', '.grid-row', function(e) {
                if ($(e.target).closest('.grid-static-col').hasClass('grid-cleared-col')) return;

                let cdn = $(this).attr('data-name');
                let row = frappe.get_doc('Purchase Order Line Item', cdn);
                //alert('Row clicked: ' + row.part_number + ', Line: ' + row.line);
                frm.events.get_purchase_order_receipt(frm, row.line);
        });

        frm.fields_dict['purchase_order_line_item'].grid.wrapper.find('.grid-remove-rows').hide();
        frm.fields_dict['purchase_order_line_item'].grid.wrapper.find('.row-index').hide();

        frm.set_df_property('return_item_serials', 'cannot_add_rows', true);

        /* frm.fields_dict['return_item_serials'].grid.wrapper.find('.grid-remove-rows').hide();
        frm.fields_dict['return_item_serials'].grid.wrapper.find('.grid-row-checkbox').hide();
        frm.fields_dict['return_item_serials'].grid.wrapper.find('.row-check').hide()
        frm.fields_dict['return_item_serials'].grid.wrapper.find('.row-index').hide() */
    },
    validate(frm){
        if (frm.doc.return_item_serials.length === 0){
            frappe.msgprint({
                title: __('ERROR'),
                indicator: 'red',
                message: __('There is no item serials to return found, please run select it first.')
            });
            e.preventDefault();
            e.stopPropagation();
            return;
        }      
    },

    getListItemSerials : function(frm, line){
        console.log("jalan", frm.doc.purchase_order, line);
        frappe.call({
            method: "warehousing.warehousing.doctype.purchase_order_return.purchase_order_return.getPoReceiptLineItemSerials",
            args: {
                purchase_order: frm.doc.purchase_order,
                line: line
            },
            freeze: true,
            freeze_message: __("Sedang memproses perubahan data..."),
            callback: function(r) {
                if (r.message.status === "success") {
                    let data = r.message.message;
                    let grid = d.fields_dict.purchaser_order_receipt_history.grid;
                    
                    grid.df.data = [];
                    grid.refresh();

                    data.forEach((item, index) => {
                        let row = grid.add_new_row();
                        row.no = index + 1;
                        row.ponumber = item.po_number || "";
                        row.poline = item.po_line || 0;
                        row.part = item.part || "";
                        row.lotserial = item.lot_serial || "";
                        row.location = item.lot_serial || "";
                        row.actual_qty = item.actual_qty || 0;
                    });

                    grid.refresh(); 
                }
                else {
                    console.log("Failed");
                }
            }
        });
    },

    get_purchase_order_receipt : function(frm, line) {
        let fields = [
                {
                    label: __("Filtering Options"),
                    fieldtype: "Section Break" 
                },
                { fieldtype: 'Data', fieldname: 'part', label: 'Part'},
                { fieldtype: 'Column Break' }, 
                { fieldtype: 'Data', fieldname: 'lot_serial', label: 'Lot Serial'},
                { fieldtype: 'Column Break' }, 
                { fieldtype: 'Data', fieldname: 'location', label: 'Current Location'},
                { fieldtype: 'Column Break' }, 
                { fieldtype: 'Float', fieldname: 'actual_qty', label: 'Qty Change'},
                
                { fieldtype: 'Section Break' },
                {
                    fieldname: "purchaser_order_receipt_history",
                    fieldtype: "Table",
                    in_place_edit: false, 
                    reqd: 1,
                    allow_filter: false, 
                    dynamic_link_filters: 0,
                    //cannot_add_rows: true,
                    fields: [
                        {fieldname: "poline", label: "PO Line", fieldtype: "Int", in_list_view: 1,  columns: 1, read_only: 1},
                        {fieldname: "part", label: "Part", fieldtype: "Link", options: 'Part Master', in_list_view: 1,  columns: 2, read_only: 1},
                        {fieldname: "lotserial", label: "Lot Serial", fieldtype: "Data", in_list_view: 1,  columns: 2, read_only: 1},
                        {fieldname: "location", label: "Location", fieldtype: "Data", in_list_view: 1,  columns: 2, read_only: 1},
                        {fieldname: "actual_qty", label: "Qty", fieldtype: "Float", in_list_view: 1,  columns: 1, read_only: 1},
                        {fieldname: "status", label: "Status", fieldtype: "Data", in_list_view: 1,  columns: 1, read_only: 1},
                        {fieldname: "expire", label: "expire", fieldtype: "Date", in_list_view: 1,  columns: 2, read_only: 1},
                    ]
                }
            ];

            const d = new frappe.ui.Dialog({
                title: 'Select stem serials that has been receipt',
                size: 'large',
                fields: fields,
                primary_action_label: 'Get Items',
                primary_action(values) {
                    const grid = d.get_field('purchaser_order_receipt_history').grid;
                    const selected_rows = grid.get_selected_children();
                    
                    if (selected_rows.length === 0) {
                        frappe.msgprint({
                            title: __('ERROR'),
                            indicator: 'red',
                            message: __('Silakan pilih setidaknya satu baris menggunakan checkbox.')
                        });
                        return;
                    }
                    
                    //frm.clear_table('return_item_serials');
                    for (let row of selected_rows) {
                        let match = frm.doc.return_item_serials.find(item => item.po_line === row.poline && item.part_number === row.part && item.lot_serial === row.lotserial && item.current_location === row.location);
                        if (!match) {
                            let child = frm.add_child('return_item_serials');
                            child.po_line = row.poline;
                            child.part_number = row.part;
                            child.lot_serial = row.lotserial;
                            child.qty_to_return = row.actual_qty;
                            child.current_location = row.location;
                            child.due_date = row.expire_date;
                        }
                    }
                    setTimeout(() => { 
                        frm.refresh_field('return_item_serials');
                        frm.set_df_property('return_item_serials', 'cannot_add_rows', true);

                        frm.fields_dict['return_item_serials'].grid.wrapper.find('.grid-remove-rows').hide();
                        frm.fields_dict['return_item_serials'].grid.wrapper.find('.grid-row-checkbox').hide();
                        frm.fields_dict['return_item_serials'].grid.wrapper.find('.row-check').hide();
                        frm.fields_dict['return_item_serials'].grid.wrapper.find('.row-index').hide();
                     }, 200);
                    d.hide();
                }
            });

            frappe.call({
                method: "warehousing.warehousing.doctype.purchase_order_return.purchase_order_return.getPoReceiptLineItemSerials",
                args: {
                    purchase_order: frm.doc.purchase_order,
                    line: line
                },
                freeze: true,
                freeze_message: __("Sedang memproses perubahan data..."),
                callback: function(r) {
                        if ( r.message.status == 'success'){
                            let raw_data = r.message.message;
                            console.log(raw_data);
                            let table_data = raw_data.map((item, index) => ({
                                no: index + 1,
                                ponumber: frm.doc.purchase_order || "",
                                poline: line || 0,
                                part: item.part || "",
                                location: item.warehouse_location || "",
                                expire: item.expire_date || "",
                                lotserial: item.lot_serial || "",
                                status: item.inventory_status || "",
                                actual_qty: item.qty_on_hand || 0
                            }));

                            d.fields_dict.purchaser_order_receipt_history.df.data = table_data;
                            d.fields_dict.purchaser_order_receipt_history.grid.refresh();
                            d.show();                      

                        }
                        else {
                            frappe.msgprint({
                                    title: __('ERROR'),
                                    indicator: 'red',
                                    message: __('Not found receipt history')
                            });
                        } 
                }
            });      
    },

    fetch_po_from_qad: function(frm){
        frappe.call({
            method: "warehousing.warehousing.doctype.purchase_order_receipt.purchase_order_receipt.getPurchaseOrderList",
            args: {
                domain : frm.doc.domain,
                purchase_order: frm.doc.purchase_order,
                trans_type: 'RETURN'
            },
            freeze: true, 
            freeze_message: __("Sedang memproses Purchase Order..."),
            callback: function(r) {
                if (r.message) {
                    let data = r.message.dsPOResponse;
                    frm.clear_table('purchase_order_line_item');
                    let this_today = frappe.datetime.get_today();
                    if (data.ttpod_det && data.ttpod_det.length > 0) {
                        data.ttpod_det.forEach(row => {
                            let child = frm.add_child('purchase_order_line_item');
                            child.line = row.podline;
                            child.part_number = row.podpart;
                            child.description = row.ptdesc1 + " " + row.ptdesc2;
                            child.um = row.ptum;
                            child.due_date = row.pod_duedate;
                            child.net_received = flt(row.pod_qtyrcvd) - flt(row.pod_qtyrtnd);
                        });

                        if (data.ttpo_mstr && data.ttpo_mstr.length > 0) {
                            let header = data.ttpo_mstr[0];
                            frm.set_value("purchase_order_old", frm.doc.purchase_order);
                            frm.set_value("supplier", header.povend);
                            frm.set_value("supplier_name", header.name_vend);

                            
                            setTimeout(() => { 
                                frm.refresh_field('purchase_order_line_item');
                                
                                frm.set_df_property('purchase_order_line_item', 'cannot_add_rows', true);
                                frm.fields_dict['purchase_order_line_item'].grid.wrapper.find('.row-index').hide();
                                frm.fields_dict['nama_field_child_table'].grid.wrapper.find('.grid-remove-rows').hide();
                                /* frm.fields_dict['purchase_order_line_item'].grid.wrapper.find('.row-index').hide();
                                frm.fields_dict['purchase_order_line_item'].grid.wrapper.find('.grid-row-checkbox').hide();
                                frm.fields_dict['purchase_order_line_item'].grid.wrapper.find('.row-check').hide(); */
                            }, 500);   
                        }
                    }
                }
            }
        })
    }
});

frappe.ui.form.on('Purchase Order Line Item', {
    form_render(frm, cdt, cdn) {
        // Sembunyikan tombol delete di dalam modal dialog row
        frm.get_field('purchase_order_line_item').grid.grid_rows_by_docname[cdn].wrapper.find('.grid-delete-row').hide();
    }
});