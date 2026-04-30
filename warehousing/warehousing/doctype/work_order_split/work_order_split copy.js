// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on('Work Order Split', {
	refresh(frm) {
        if (frm.doc.docstatus === 0 && !frm.is_new()) {
            frm.page.set_primary_action(__('Submit'), function() {
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
            });
        }
	    frm.fields_dict['work_order'].$input.on('blur', function() {
	        if (frm.doc.work_order){frm.trigger('fetch_workorder_from_qad');}
	    });  
	 
	    frm.fields_dict['quantity_to_be_produced_immediately'].$input.on('blur', function() {

	        if(frm.doc.quantity_to_be_produced_immediately > 0 && frm.doc.work_order){
                frm.set_value("qty_in_tonnase",frm.doc.quantity_to_be_produced_immediately / 1000);
	            frm.trigger('fetch_simulated_picklist_item');
	        }
	    });
	    
	    if (frm.doc.shopfloor_location){
	        frm.trigger('get_availablity_stock');
	    }
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
                            let percent = 0;
                            frappe.model.set_value(target_row.doctype, target_row.name, 'actual_required', api_row.ttdet_qty_req);
                            if (target_row.availability > 0) {
                                percent = target_row.availability / api_row.ttdet_qty_req * 100;
                                frappe.model.set_value(target_row.doctype, target_row.name, 'availability_in_percent', percent);
                            }
                            
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
                frappe.db.get_list('Inventory', {
                         filters: {
                            'site': frm.doc.site,
                            'part': row.part,
                            'warehouse_location': frm.doc.shopfloor_location,
                        },
                        fields: ['sum(qty_on_hand) as total_stok']
                    }).then(data => {
                        let stok = data[0].total_stok || 0;
                        let percent = 0;
                        if (stok > 0) {percent = stok / row.actual_required * 100;}
    
                        frappe.model.set_value(row.doctype, row.name, "availability", stok);
                        frappe.model.set_value(row.doctype, row.name, "availability_in_percent", percent);
                 });
            }
        });
        
        frm.refresh_field('work_order_split_detail');
        
        /*    
        frm.doc.work_order_split_detail.forEach(row => {
            if (row.part) {
                frappe.call({
                    method: "frappe.client.get_list",
                    args: {
                        doctype: "Inventory",
                        filters: {
                            site: frm.doc.site,
                            part: "122-002",
                            warehouse_location: frm.doc.shopfloor_location,
                        },
                        fields: ["sum(qty_on_hand) as total_stok"]
                    },
                    callback: function(r) {
                        if (r.message && r.message.length > 0) {
                            let total = r.message[0].total_stok;
                            frappe.msgprint(total);
                            //return total;
                        }
                    }
                });
            }
        });*/
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

                    frappe.msgprint(data['womstr'].wopart);
                    if (data.woddet && data.woddet.length > 0) {
                        data.woddet.forEach(row => {
                            
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
                             frappe.db.get_value("Part Master", {"name": row.wodpart},"item_group").then(value => {
                                if (value.message && value.message.item_group){ 
                                        child.item_group= value.message.item_group;
                                }      
                            });
     
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
                    }, 1000);
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
    

})
