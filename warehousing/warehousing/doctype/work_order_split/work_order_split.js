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
        
        }
	    frm.fields_dict['work_order'].$input.on('blur', function() {

	        if (frm.is_new() && frm.doc.work_order){
                frm.clear_table("work_order_split_detail");
                frm.refresh_field("work_order_split_detail");

                frm.set_value("quantity_to_be_produced_immediately",0);
                frm.set_value("qty_in_tonnase",0);
                //frm.set_value("shopfloor_location","");
                frm.trigger('fetch_workorder_from_qad');
                setTimeout(() => { 
                    
                    frm.trigger('load_wo_history');
                    frm.scroll_to_field('quantity_to_be_produced_immediately');
                }, 500); 
            }
            
	    });  
	 
	    frm.fields_dict['quantity_to_be_produced_immediately'].$input.on('blur', async function() {
	        if(frm.doc.quantity_to_be_produced_immediately > 0 && frm.doc.work_order){
                try {
                    const response = await frappe.db.get_list('Work Order Split', {
                        filters: {
                            'work_order': frm.doc.work_order,
                            'docstatus': 1
                        },
                        fields: ['quantity_to_be_produced_immediately', 'quantity_ordered', 'quantity_completed', 'um']
                    });
                                
                    let totalInputed = 0;
                    if (response && response.length > 0) {
                        totalInputed = response.reduce((sum, row) => sum + (row.quantity_to_be_produced_immediately || 0), 0);
                    }
                    let totalQtyAllowed = flt(frm.doc.quantity_ordered) + flt(((frm.doc.quantity_ordered * 10) / 100));
                    let qtyAllowed = totalQtyAllowed - flt(totalInputed);
                    
                    if (totalQtyAllowed < flt(frm.doc.quantity_to_be_produced_immediately) + flt(totalInputed)) {
                        frm.set_value("quantity_to_be_produced_immediately", 0);
                        frm.scroll_to_field('quantity_to_be_produced_immediately');
                        frappe.msgprint({
                            title: __('MESSAGE'),
                            indicator: 'red',
                            message: __('Qty input over than allowed. Maximal Qty input is only ' + String(qtyAllowed) )
                        });
                        return; // Stop further execution if the condition is met

                    } 
                    else {
                        frm.set_value("qty_in_tonnase", flt(frm.doc.quantity_to_be_produced_immediately) * flt(frm.doc.fg_netwt) / 1000);
                        frm.trigger('fetch_simulated_picklist_item');         
                    }     

                } catch (error) {
                    console.error("Gagal mengambil data dari Work Order Split:", error);
                }
	        }
	    });
	    
	    /* if (frm.doc.shopfloor_location){
	        frm.trigger('get_availablity_stock');
	    } */
	},

	
    shopfloor_location: function(frm) {
        frm.trigger('get_availablity_stock');
    },

    fetch_simulated_picklist_item: async function(frm) {
        // 1. Bekukan layar di awal proses
        frappe.dom.freeze(__("Sedang proses verifikasi data..."));

        try {
            let buffer_tolerance = 0;
            try {
                buffer_tolerance = await frappe.db.get_single_value('Work Order Activity Control', 'buffer_tollerance');
            } catch (e) {
                console.warn("Gagal mengambil buffer_tolerance karena permission. Default ke 0.");

            }

            // 2. Ambil data dari API Utama
            const response = await frappe.call({
                method: "warehousing.warehousing.allAPI.get_simulated_picklist_item", 
                args: {
                    workOrder: frm.doc.work_order, 
                    site: frm.doc.site, 
                    part: frm.doc.finish_good, 
                    qty: frm.doc.quantity_to_be_produced_immediately, 
                    domain: "SMII"
                }
            });

            if (response && response.message) {
                let data = response.message.ttdet_table || [];

                // Ganti .forEach menjadi for...of agar bisa menggunakan AWAIТ di dalam loop
                for (let api_row of data) {
                    
                    // 3. Cari baris di child table yang part-nya sama
                    let target_row = (frm.doc.work_order_split_detail || []).find(row => row.part === api_row.ttdet_component);

                    if (target_row) {
                        // Set nilai awal dari API
                        frappe.model.set_value(target_row.doctype, target_row.name, 'ori_cur_req', api_row.ttdet_qty_req);

                        // Hitung requirement awal dengan buffer tolerance
                        let required = flt(api_row.ttdet_qty_req) + (flt(api_row.ttdet_qty_req) * flt(buffer_tolerance) / 100);
                         // Set nilai actual required akhir
                        frappe.model.set_value(target_row.doctype, target_row.name, 'actual_required', required);
                        
                        // 4. Ambil FREE QTY dari server (Menunggu hingga selesai/Await)
                        const free_qty_can_used_api = await frappe.call({
                            method: "warehousing.warehousing.doctype.work_order_split.work_order_split.get_work_order_split_detail",
                            args: { component: api_row.ttdet_component }
                        });

                        let free_qty_can_used = 0;
                        let min_requested = 0;
                        let base_requested = 0;
                        if (free_qty_can_used_api && free_qty_can_used_api.message !== undefined) {
                            free_qty_can_used = flt(free_qty_can_used_api.message);

                            // Kurangi required dengan free_qty
                            //required = required - free_qty_usage;
                        }

                        base_requested = required;
                        if (free_qty_can_used > 0) {
                            min_requested = Math.min(required, free_qty_can_used);
                            base_requested = required - min_requested;

                            frappe.model.set_value(target_row.doctype, target_row.name, 'free_qty_usage', min_requested); 
                        }
                        console.log(required + " - " + free_qty_can_used + " - " + min_requested + " - " + base_requested);
                        let qty_request_by_pack = 0;
                        if (base_requested > 0) {
                            const qty_pack_item = await frappe.call({
                                method: "warehousing.warehousing.doctype.part_master.part_master.get_item_pack",
                                args: { part_number: api_row.ttdet_component }
                            });


                            if (qty_pack_item && qty_pack_item.message !== undefined) {
                                qty_request_by_pack = calculateQtyRequiredByPackaging(base_requested, qty_pack_item.message );
                                const free_qty_to_given = qty_request_by_pack -  Math.ceil(base_requested);
                                frappe.model.set_value(target_row.doctype, target_row.name, 'qty_in_packaging', qty_pack_item.message );
                                frappe.model.set_value(target_row.doctype, target_row.name, 'cur_req_by_pckg', qty_request_by_pack);
                                frappe.model.set_value(target_row.doctype, target_row.name, 'free_qty', free_qty_to_given);
                                
                               
                            }
                        }
                        frappe.model.set_value(target_row.doctype, target_row.name,  "qty_confirm", qty_request_by_pack);

        
                        /* if (target_row.availability > 0 && required > 0) {
                            let percent = cint(flt(target_row.availability / required * 100, 0));
                            frappe.model.set_value(target_row.doctype, target_row.name, 'availability_in_percent', percent);
                        } else {
                            frappe.model.set_value(target_row.doctype, target_row.name, 'availability_in_percent', 0);
                        } */
                    }
                }

                // 5. Refresh UI Child Table setelah loop SELESAI semua
                frm.refresh_field('work_order_split_detail');
                
                /* setTimeout(() => { 
                    frm.trigger('get_availablity_stock');
                }, 500); */

            }

        } catch (error) {
            console.error("Error pada fetch_simulated_picklist_item:", error);
            frappe.msgprint(__("Terjadi kesalahan saat memproses data. Silakan cek konsol browser."));
            
        } finally {
            // 6. Pastikan layar SELALU terbuka kembali baik sukses maupun gagal
            frappe.dom.unfreeze();
        }
    },
        
    get_availablity_stock:function(frm) {
        frm.doc.work_order_split_detail.forEach(row => {
            if (row.part) {
                frappe.call({
                    method: "warehousing.warehousing.doctype.work_order_split.work_order_split.get_stock_availability_in_production", 
                    args:{site: frm.doc.site, part:row.part, warehouse_location: frm.doc.shopfloor_location, wo_number: frm.doc.work_order}, 
                    freeze: true, 
                    freeze_message: __("Sedang memproses Work Order..."),
                    callback: function(r) {
                        if (r.message) {
                            let availability = r.message.availability || 0;
                            let outstanding = r.message.outstanding || 0;
                            let percent = 0;
                            if (availability > 0) {
                                percent = availability / row.actual_required * 100;
                            }

                            qty_request = row.actual_required - availability;
                            if (availability > row.actual_required){
                                qty_request = 0;
                            } 
                            frappe.model.set_value(row.doctype, row.name, "outstanding", outstanding);
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
                                    <b>Request : <a href="/app/item-request/${row.link_to_item_request}">${row.link_to_item_request}</a></b>
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

function calculateQtyRequiredByPackaging(qtyRequired, qtyPackaging) {
    if (qtyPackaging <= 0) return qtyRequired; // Validasi agar tidak terjadi pembagian dengan nol
    
    // 1. Bagi qty required dengan qty packaging
    // 2. Bulatkan ke atas menggunakan Math.ceil
    // 3. Kalikan kembali dengan qty packaging
    let jumlahKemasan = Math.ceil(qtyRequired / qtyPackaging);
    let qtyRequest = jumlahKemasan * qtyPackaging;
    
    return qtyRequest;
}
