// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on('Work Order Split', {
    onload: function(frm) {
        if (frm.is_new()) {
            frm.clear_table("work_order_split_detail");
            frm.refresh_field("work_order_split_detail");
            console.log("ONLOAD");
        }
    },
	refresh(frm) {
        frm.set_df_property('work_order_split_detail', 'cannot_add_rows', true);
        if (frm.doc.docstatus === 0 && !frm.is_new()) {
            frm.page.set_primary_action(__('Submit'), function() {
                frappe.confirm('Are you sure you want to proceed?',
                () => {
                    frm.set_value("calculation_request_method", 2);
                    frm.set_value("status", "Submitted");

                    frm.save('Submit');
                }, () => {
                    'Continue',
                    true
                })
            });
        
            /* frm.page.set_primary_action(__('Submit'), function() {
                let d = new frappe.ui.Dialog({
                    title: 'Konfirmasi Permintaan Material',
                    fields: [
                        {
                            label: 'Metode Perhitungan Permintaan',
                            fieldname: 'request_option',
                            fieldtype: 'Select',
                            options: [
                                {"value": 1, "label": __("Berdasarkan Aktual Kebutuhan Saja")},
                                {"value": 2, "label": __("Akumulasi Aktual Kebutuhan & Ketersediaan")}
                            ],
                            default:1,
                            render_input: 1 
                        }
                    ],
                    primary_action_label: 'Submit',
                    primary_action(values) {
                        frm.set_value("calculation_request_method", values.request_option);
                        frm.set_value("status", "Submitted");
                        d.hide();
                        frm.save('Submit');
                    }
                });
                
                d.show();
            }); */
        }
	    frm.fields_dict['work_order'].$input.on('blur', function() {

	        if (frm.is_new() && frm.doc.work_order){
                frm.clear_table("work_order_split_detail");
                frm.refresh_field("work_order_split_detail");

                frm.set_value("quantity_to_be_produced_immediately",0);
                frm.set_value("qty_in_tonnase",0);
                frm.set_value("shopfloor_location","");
                frm.trigger('fetch_workorder_from_qad');
                console.log("INPUT WORK ORDER");
                setTimeout(() => { 
                    console.log("load history");
                    frm.trigger('load_wo_history');
                }, 500); 
            }
            
	    });  
	 
	    frm.fields_dict['quantity_to_be_produced_immediately'].$input.on('blur', function() {
            //alert("test");
	        if(frm.doc.quantity_to_be_produced_immediately > 0 && frm.doc.work_order){
                frm.set_value("qty_in_tonnase",frm.doc.quantity_to_be_produced_immediately / 1000);
	            frm.trigger('fetch_simulated_picklist_item');
	        }
	    });
	    
	    /* if (frm.doc.shopfloor_location){
	        frm.trigger('get_availablity_stock');
	    } */
	},

	
    shopfloor_location: function(frm) {
        frm.trigger('get_availablity_stock');
    },

	
    fetch_simulated_picklist_item: function(frm){
        frappe.call({
            method: "warehousing.warehousing.allAPI.get_simulated_picklist_item", 
            args:{workOrder:frm.doc.work_order, site: frm.doc.site, part:frm.doc.finish_good, qty:frm.doc.quantity_to_be_produced_immediately, domain: "SMII"}, 
            freeze: true, 
            freeze_message: __("Sedang memproses Work Order..."),
            callback: function(r) {
                if (r.message) {
                    let data = r.message.ttdet_table;
                    data.forEach(api_row => {
                        // 3. Cari baris di child table yang part-nya sama
                        let target_row = (frm.doc.work_order_split_detail || []).find(row => row.part === api_row.ttdet_component);
                
                        if (target_row) {
                            frappe.db.get_single_value('Work Order Activity Control', 'buffer_tollerance')
                            .then(value => {
                                let percent = 0;
                                let required = flt(api_row.ttdet_qty_req) + (flt(api_row.ttdet_qty_req) * flt(value) / 100) ;
                                frappe.model.set_value(target_row.doctype, target_row.name, 'actual_required', required);
                                if (target_row.availability > 0) {
                                    percent = flt(target_row.availability / required * 100, 0);
                                    percent = cint(percent)
                                    frappe.model.set_value(target_row.doctype, target_row.name, 'availability_in_percent', percent);
                                }
                            });


                            
                        }
                    });
                
                    // 5. Refresh UI & Berikan feedback
                    frm.refresh_field('work_order_split_detail');
                }
            },
        })
    },
    
    get_availablity_stock:function(frm) {
        frm.doc.work_order_split_detail.forEach(row => {
            if (row.part) {
                frappe.call({
                    method: "warehousing.warehousing.doctype.work_order_split.work_order_split.get_stock_availability_in_production", 
                    args:{site: frm.doc.site, part:row.part, warehouse_location: frm.doc.shopfloor_location, wo_split_number: frm.doc.name}, 
                    freeze: true, 
                    freeze_message: __("Sedang memproses Work Order..."),
                    callback: function(r) {
                        if (r.message) {
                            let availability = r.message.availability || 0;
                            let percent = 0;
                            if (availability > 0) {
                                percent = availability / row.actual_required * 100;
                            }

                            qty_request = row.actual_required - availability;
                            if (availability > row.actual_required){
                                qty_request = 0;
                            } 
                            frappe.model.set_value(row.doctype, row.name, "qty_confirm", qty_request);
                            frappe.model.set_value(row.doctype, row.name, "availability", availability);
                            frappe.model.set_value(row.doctype, row.name, "availability_in_percent", percent);

                        }
                    },
                });
            }
        });
        
        frm.refresh_field('work_order_split_detail');
        

    },
        
    fetch_workorder_from_qad(frm){
        frappe.call({
            method: "warehousing.warehousing.allAPI.get_workorder_from_qad", 
            args:{work_order: frm.doc.work_order, domain: "SMII"}, 
            freeze: true, 
            freeze_message: __("Sedang memproses Work Order..."),
            callback: function(r) {
                if (r.message) {
                    let data = r.message.dsWOResponse;
                    frm.clear_table('work_order_split_detail');

                    if (data.woddet && data.woddet.length > 0) {
                        data.woddet.forEach(row => {
                            if (row.wodpart_grouping){
                                let child = frm.add_child('work_order_split_detail');
                                child.part = row.wodpart;
                                child.description = row.wodpart_desc;
                                child.um = row.wodpart_um;
                                child.prod_line = row.wodprod_line;
                                child.qty_per_pallet = row.wodpart_qtyperpallet;
                                child.net_weight = row.wodpart_netwt;
                                child.qty_required = row.wodqty_req;
                                child.qty_issued = row.wodqty_iss;
                                child.qty_confirm = 0;
                                child.qty_confirm = 0;
                                child.qty_issued = 0;
                                child.item_group= row.wodpart_grouping;
                            }      
     
                        });
                    }
                    if (data.womstr && data.womstr.length > 0) {
                        let header = data.womstr[0];
                        
                        frm.set_value("site", header.wosite);
                        frm.set_value("work_order_status", header.wostatus);
                        frm.set_value("work_order", header.wonbr);
                        frm.set_value("id", header.wolot);
                        frm.set_value("remarks", header.wormks);
                        frm.set_value("finish_good", header.wopart);
                        frm.set_value("fg_description", header.wopart_desc);
                        frm.set_value("um", header.wopart_um);
                        frm.set_value("order_date", header.woord_date);
                        frm.set_value("release_date", header.worel_date);
                        frm.set_value("due_date", header.wodue_date);
                        frm.set_value("fg_qty_per_pallet", header.wopart_qtyperpallet);
                        frm.set_value("fg_netwt", header.wopart_netwt);
                        frm.set_value("quantity_ordered", header.woqty_ord);
                        frm.set_value("quantity_completed", header.woqty_comp);
                        frm.set_value("quantity_rejected", header.woqty_rjct);
                    }
    
                    setTimeout(() => { 
                        frm.refresh_field('work_order_split_detail');
                    }, 500);
                }
                else {
                    frappe.msgprint(__("Work Order tidak ditemukan."));
                }
            },
            error: function(r) {
                frappe.msgprint(__("Terjadi kesalahan saat menghubungi server"));
            }
        });
    },
    
    load_wo_history: function(frm) {
        frappe.call({
            method: "warehousing.warehousing.doctype.work_order_split.work_order_split.get_material_transfer_slip_history_by_wo",
            args: {
                work_order: frm.doc.work_order,
                //current_doc: frm.doc.name
            },
            callback: function(r) {
                let container = frm.get_field('wo_tracking_html').$wrapper;
                
                if (r.message && r.message.length > 0) {
                    let html = `
                        <table class="table table-bordered" style="font-size: 13px;">
                            <thead class="bg-light">
                                <tr>
                                    <th>Header</th>
                                    <th>Item Details</th>
                                </tr>
                            </thead>
                            <tbody>`;

                    r.message.forEach(row => {
                        // Render Baris Item
                        let item_rows = row.items.map(item => `
                            <tr>
                                <td>${item.part}</td>
                                <td>${item.description}</td>
                                <td>${item.um}</td>
                                <td>${item.item_group}</td>
                                <td class="text-right"><strong>${flt(item.qty_confirm)}</strong></td>
                            </tr>
                        `).join('');

                        html += `
                            <tr>
                                <td class="bg-light" style="width: 30%;">
                                    <b><a href="/app/work-order-split/${row.name}">${row.name}</a></b><br>
                                    <small>Request Date: ${frappe.datetime.str_to_user(row.posting_date)}</small><br>
                                    <small>Status: ${row.status}</small><br>
                                    <b><a href="/app/item-request/${row.link_to_item_request}">${row.link_to_item_request}</a></b>
                                </td>
                                <td >
                                    <table class="table table-sm p-1" style="border:none;">
                                        <tr class="text-muted small">
                                            <th>Part</th>
                                            <th>Description</th>
                                            <th>Um</th>
                                            <th>Group</th>
                                            <th class="text-right">Qty requested</th>
                                        </tr>
                                        ${item_rows}
                                    </table>
                                </td>
                            </tr>`;
                    });

                    html += `</tbody></table>`;
                    container.html(html);
                } else {
                    container.html('<div class="text-muted p-3">Belum ada riwayat..</div>');
                }
            }
        });
    },

})
