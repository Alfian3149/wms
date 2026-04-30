// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Work Order Comp Issued", {
    onload: function(frm) {
        frm.set_df_property('mts_number', 'hidden', 1);
        filter_child_table_items(frm);
        frm.set_df_property('work_order_split_number', 'read_only', 1);
        
        frm.set_df_property('section_break_whir', 'hidden', 1);
        frm.set_df_property('work_order_detail_section', 'hidden', 1);
        frm.set_df_property('item_summary_to_issued', 'cannot_add_rows', true);
        frm.set_df_property('item_issued', 'cannot_add_rows', true);


        let btn = frm.get_field('get_material_stock').$wrapper.find('button');

        btn.on('mouseenter', function() {
            $(this).css('background-color', '#171717');
        }).on('mouseleave', function() {
            $(this).css('background-color', '#090909');
        });

    },
 	refresh(frm) {
         frm.add_custom_button(__('Entry Via Scanner'), function() {
            // Array sementara untuk menampung hasil scan
            let scanned_items = [];
            let scanned_qty = [];

            if (frm.doc.item_issued && frm.doc.item_issued.length > 0) {
                frm.doc.item_issued.forEach(item => {
                    //scanned_items.push({ item_code: item.part, description: item.description, um:item.um, lotserial:item.lot_serial,  qty: item.quantity });
                    const parsed_data = JSON.parse(item.weighing_scanned);
                    //scanned_qty = scanned_qty.concat(parsed_data);
                   

                    parsed_data.forEach(item =>{
                        scanned_items.push({item_code: item.item_code, description:  item.description, um:item.um, lotserial:item.lotserial, qty_needed: item.qty_needed, qty_lot_available:item.qty_lot_available, qty_scanned:  item.qty_scanned, in_location:item.in_location,  no: scanned_items.length + 1 });
                        
                        item.details.forEach(item =>{
                            scanned_qty.push({item_code:item.item_code, quantity_scanned:flt(item.quantity_scanned), unique_id_scanned:item.unique_id_scanned})
                        })
                    })
                });
            }

            
            let d = new frappe.ui.Dialog({
                title: 'Scan Barcode',
                fields: [
                    {
                        label: 'Barcode',
                        fieldname: 'scan_input',
                        fieldtype: 'Data',
                        in_focus: 1
                    },
                    {
                        fieldtype: 'HTML',
                        fieldname: 'scan_list_html',    
                        label: 'Daftar Scan'
                    }
                ],
                size: 'large',
                primary_action_label: 'Process To Issued',
                primary_action(values) {
                    if (scanned_items.length === 0) {
                        frappe.msgprint("Belum ada data yang discan.");
                        return;
                    }
                    
                    frm.clear_table('item_issued');
                    let all_scanned = [];

                    scanned_items.forEach(barcode => {
                        all_scanned = []
                        const weighing_found = scanned_qty.filter(row => row.item_code === barcode.item_code)
                        const total_qty = scanned_qty.filter(row => row.item_code === barcode.item_code).reduce((total, row) => total + flt(row.quantity_scanned), 0);

                        all_scanned.push({
                            ...barcode,             // mengambil "item_code"
                            details: weighing_found // memasukkan array hasil filter
                        });

                        let row = frm.add_child('item_issued'); 
                        frappe.model.set_value(row.doctype, row.name, 'part', barcode.item_code);
                        frappe.model.set_value(row.doctype, row.name, 'description', barcode.description);
                        frappe.model.set_value(row.doctype, row.name, 'um', barcode.um);
                        frappe.model.set_value(row.doctype, row.name, 'lot_serial', barcode.lotserial);
                        frappe.model.set_value(row.doctype, row.name, 'quantity', flt(total_qty));
                        frappe.model.set_value(row.doctype, row.name, 'from_location', barcode.in_location);
                        frappe.model.set_value(row.doctype, row.name, 'weighing_scanned', JSON.stringify(all_scanned, null, 2) );
                        
                    });
                    
                    frm.refresh_field('item_issued');

                    frm.save()
                    d.hide();
                    //frappe.show_alert({message: __('Berhasil menambahkan ' + scanned_items.length + ' item'), indicator: 'green'});
                }
            });

            // Fungsi untuk memperbarui tampilan tabel di dalam Dialog
            const render_scan_list = () => {
                
                let html = `<table class="table table-bordered" style="border-radius: 8px; overflow: hidden; border-collapse: separate; border-spacing: 0;">
                <thead style="background-color: #f8f9fa;">
                    <tr>
                        <th style="width: 70%">Detail Lot / Serial</th>
                        <th style="width: 30%; text-align: right;">Qty Scanned</th>
                    </tr>
                </thead>
                <tbody>`;

                if (scanned_items.length === 0) {
                    html += `<tr><td colspan="6" class="text-muted text-center">Belum ada data. Silakan scan...</td></tr>`;
                } else {
                    const grouped = scanned_items.reduce((acc, item) => {
                        if (!acc[item.item_code]) {
                            acc[item.item_code] = {
                                details: [],
                                total_qty: 0,
                                description: item.description,
                                um: item.um,
                                qty_needed: item.qty_needed,
                            };
                        }
                        acc[item.item_code].details.unshift(item);
                        acc[item.item_code].total_qty += flt(item.qty_scanned); // gunakan flt() jika di Frappe
                        return acc;
                    }, {});
                    for (let code in grouped) {
                        const group = grouped[code];
                        
                        // Baris Header Barang (Muncul 1x per Item)
                        html += `
                            <tr style="background-color: #e9ecef; font-weight: bold;">
                                <td colspan="2">
                                    ${code} - ${group.description} <span style="color: #1a73e8;">(Qty Needed: ${group.qty_needed} ${group.um || 'UNIT'}) </span>
                                </td>
                            </tr>
                        `;

                        // Baris Detail Lot (Hanya menampilkan yang unik)
                        group.details.forEach((item) => {
                            html += `
                                <tr>
                                    <td style="padding-left: 30px;">• Qty Available: ${item.qty_lot_available} Lot/Serial: ${item.lotserial} </td>
                                    <td style="text-align: right;">${flt(item.qty_scanned)}</td>
                                </tr>
                            `;
                        });

                        // Baris Total per Barang
                        html += `
                            <tr style="font-weight: bold;">
                                <td style="text-align: right; color: #6c757d;">Total :</td>
                                <td style="text-align: right; border-top: 1px solid #dee2e6;">${group.total_qty}</td>
                            </tr>
                        `;
                    }
                }
                
                html += `</tbody></table>`;
                d.get_field('scan_list_html').$wrapper.html(html);
            };

            // Menangani input dari Scanner (Enter)
            d.$wrapper.on('keydown', 'input', function(e) {
                if (e.which === 13) { 
                    e.preventDefault();
                    e.stopPropagation();
                    let val = d.get_value('scan_input');
                    const scan = val.split("#");

                  
                    if (scan.length === 3){ 
                        const item = scan[0];  
                        const quantity = scan[1]; 
                        const unique_id = scan[2];
                        const double_scanned_weigh = scanned_qty.find(row => row.item_code === item && row.unique_id_scanned === unique_id)
                        if (double_scanned_weigh){
                            d.set_value('scan_input', '');
                            frappe.msgprint({
                                title: __('ERROR'),
                                indicator: 'red',
                                message:__("Item {0} dengan ID {1} weighing double scanned", [item, unique_id]),
                            });
                            frappe.validated = false; 
                            return false;
                        }
                        const item_found = scanned_items.find(row => row.item_code === item)
                        if (item_found){
                            d.set_value('scan_input', '');
                            let totalQtyScanned = item_found.qty_scanned  +  flt(quantity);
                            /* if (item_found.qty_lot_available <  totalQtyScanned) {
                                frappe.msgprint({
                                title: __('ERROR'),
                                indicator: 'red',
                                message:__("Qty scanned is over for the Qty available item/LotSerial ", [item, unique_id]),
                                 });
                                frappe.validated = false; 
                                return false;
                            } */
                            item_found.qty_scanned = totalQtyScanned;
                            scanned_qty.push({item_code:item, quantity_scanned:flt(quantity), unique_id_scanned:unique_id})
                            render_scan_list();
                        }
                        else{
                            d.set_value('scan_input', '');
                            frappe.msgprint(__("This item {0} does not exist in the list below. You need to scan the Item & Lot/serial first", [item]));
                            frappe.validated = false;
                            return false;
                        }

                    }
                    else if (scan.length === 2) {
                        const item = scan[0];      // "ITEM12345"
                        const lotSerial = scan[1]; // "LOT98765"
                        const double_scanned = scanned_items.find(row => row.item_code === item && row.lotserial === lotSerial)

                        if (double_scanned) {
                            d.set_value('scan_input', '');
                            frappe.msgprint({
                                title: __('ERROR'),
                                indicator: 'red',
                                message:__("Item {0} dan Lot {1} double scanned", [item,lotSerial]),
                            });
                            frappe.validated = false; // Batalkan proses jika perlu
                            return false;
                        }
                        const row_found = frm.doc.item_summary_to_issued.find(row => row.part === item)

                        if (row_found) {
                            frappe.call({
                            method: "warehousing.warehousing.doctype.work_order_comp_issued.work_order_comp_issued.get_inventory_clean_for_production",
                            args: {
                                site: "1000",
                                item: item,
                                lotserial: lotSerial,
                                status: "P-GOOD",
                                qty_needed:row_found.qty_needed,
                            },
                            callback: function(r) {
                                if(r.message.notOk){
                                    d.set_value('scan_input', '');
                                    frappe.msgprint(__(r.message.message));
                                    frappe.validated = false; // Batalkan proses jika perlu
                                    return false;
                                }
                                else{
                                    scanned_items.push({ item_code: item, description: row_found.description, um:row_found.um, lotserial:lotSerial, qty_needed: row_found.qty_needed, qty_lot_available:r.message.inventory[0].qty_on_hand, qty_scanned: flt(0), in_location:r.message.inventory[0].warehouse_location,  no: scanned_items.length + 1 });
                                    render_scan_list();
                                    d.set_value('scan_input', '');
                                    
                                    return false;

                                    
                                }
                            }
                            
                            });
                            
                        }
                        else { 
                            d.set_value('scan_input', '');
                            frappe.msgprint(__("Item {0} dengan Lot {1} bukan material produksi untuk produksi ini", [item,lotSerial]));
                            frappe.validated = false; // Batalkan proses jika perlu
                            
                            return false;
                        }
                    }
                    else {
                        
                        frappe.msgprint(__("Format Barcode tidak dikenal"));
                        d.set_value('scan_input', '');
                        
                    }

                }
            });

            d.show();
            render_scan_list(); // Inisialisasi tabel kosong
        });

        let container = frm.get_field('lotserial_has_received').$wrapper;
        let container1 = frm.get_field('html_wo_detail').$wrapper;
        let html = ``;
        container.html(html);
        container1.html(html);
        if (frm.doc.wo_api){
            frm.set_df_property('section_break_whir', 'hidden', 0);
            frm.set_df_property('work_order_detail_section', 'hidden', 0);
            frm.events.render_work_order_detail(frm,  JSON.parse(frm.doc.wo_api));
            //frm.events.render_item_summary(frm, JSON.parse(frm.doc.wo_api));
            frm.events.render_lotserial_has_been_received(frm, JSON.parse(frm.doc.wo_api));
        }

        if(frm.doc.for_material_packaging__blending === "Packaging"){
            frm.set_df_property('qty_product_completed_to_be_issued', 'read_only', 1);
        }
        else if(frm.doc.for_material_packaging__blending === "Blending"){
            frm.set_df_property('mts_number', 'hidden', 0);
            frm.set_df_property('work_order_split_number', 'hidden', 1);
        }
        else{
            
            frm.set_df_property('all_components_section', 'hidden', 1);
            frm.set_df_property('get_material_stock', 'hidden', 1);
            
        }

        frm.set_query('work_order_split_number', function() {
            return {
                filters: {
                    'status': ['!=', 'Completed']
                }
            }; 
        });

        frm.set_df_property('work_order_number', 'read_only', 1);
  

    },

    render_lotserial_has_been_received: function(frm, data) {
        let data_wo_obj = data || frm.doc.wo_api ? JSON.parse(frm.doc.wo_api) : {};
        if (data_wo_obj.tt_fg_rct && data_wo_obj.tt_fg_rct.length > 0) {
            
            let container = frm.get_field('lotserial_has_received').$wrapper;
                 let html = `
                    <table class="table table-bordered" style="font-size: 13px;">
                        <thead class="bg-light">
                            <tr>
                               <th>No.</th>
                                <th>Lot/Serial</th>
                                <th>Employee Received</th>
                                <th>Date</th>
                                <th>Time </th>
                                <th>Quantity</th>
                            </tr>
                        </thead>
                        <tbody>`;


                    let item_rows = data_wo_obj.tt_fg_rct.map((lot, index) =>  `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${lot.tt_lot || ''}</td>
                            <td>${lot.tt_emp_rct}</td>
                            <td>${lot.tt_date_rct}</td>
                            <td>${lot.tt_time_rct}</td>
                            <td class="text-right">${format_number(lot.tt_qty_rct) || 0}</td>
                        </tr>
                    `).join('');
                    item_rows = item_rows + `<tr><td colspan="5" class="text-center text-muted"><strong>Total</strong></td><td class="text-right"><strong>${format_number(data_wo_obj.tt_fg_rct.reduce((acc, lot) => acc + (lot.tt_qty_rct || 0), 0)) || 0}</strong></td></tr>`;
                    html += item_rows; 
                    html += `</tbody></table>`;
                    
                    container.html(html);

        }
    },
    
    render_work_order_detail: function(frm, data) {
        let data_wo_obj = data || frm.doc.wo_api ? JSON.parse(frm.doc.wo_api) : {};
        if (data_wo_obj.womstr && data_wo_obj.woddet.length > 0) {
            
            let container = frm.get_field('html_wo_detail').$wrapper;
                 let html = `
                    <table class="table table-bordered" style="font-size: 13px;">
                        <thead class="bg-light">
                            <tr>
                               <th>No.</th>
                                <th>Part</th>
                                <th>Description</th>
                                <th>UM</th>
                                <th>Item Group</th>
                                <th>Full Required</th>
                                <th>Full Issued</th>
                            </tr>
                        </thead>
                        <tbody>`;


                    let item_rows = data_wo_obj.woddet.map((item, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${item.wodpart || ''}</td>
                            <td>${item.wodpart_desc || ''}</td>
                            <td>${item.wodpart_um || ''}</td>
                            <td>${item.item_group || ''}</td>
                            <td class="text-right"><strong>${format_number(item.wodqty_req) || 0}</strong></td>
                            <td class="text-right">${format_number(item.wodqty_iss) || 0}</td>
                        </tr>
                    `).join('');

                    html += item_rows; 
                    html += `</tbody></table>`;
                    
                    container.html(html);

        }
    },
    
    render_item_summary: function(frm, data) {
        let data_wo_obj = data || frm.doc.wo_api ? JSON.parse(frm.doc.wo_api) : {};
        if (data_wo_obj.womstr && data_wo_obj.woddet.length > 0) {
            frm.clear_table('item_summary_to_issued');
            frm.get_field('item_summary_to_issued').grid.cannot_add_rows = true;
            frm.get_field('item_summary_to_issued').grid.cannot_delete_rows = true;
            for (let d of data_wo_obj.woddet) {
                const isPackaging = frm.doc.for_material_packaging__blending === "Packaging" && d.item_group === "PACKAGING";
                const isBlending = frm.doc.for_material_packaging__blending === "Blending" && d.item_group === "INGREDIENT";
                if (isPackaging || isBlending) {
                    let row = frm.add_child('item_summary_to_issued');
                    row.part = d.wodpart;
                    row.um = d.wodpart_um;
                    row.description = d.wodpart_desc;
                    row.item_group = d.item_group; 
                    row.qty_full_required = d.wodqty_req;
                    row.qty_full_issued = d.wodqty_iss;
                    row.product_line = d.wodprod_line;
                    
                    let match = data_wo_obj.simulated_picklist.find(item => item.ttdet_component === d.wodpart);
                    let qty_needed_val = match ? match.ttdet_qty_req : 0;

                    //row.qty_needed = qty_needed_val;
                }
                 
            }
            frm.refresh_field('item_summary_to_issued');
        
        }
    },

    for_material_packaging__blending: function(frm) {
        if (frm.doc.for_material_packaging__blending === "Packaging") {

            frm.set_df_property('qty_product_completed_to_be_issued', 'read_only', 1);
            frm.set_df_property('work_order_split_number', 'read_only', 1);
            frm.set_df_property('work_order_number', 'read_only', 0);
            frm.set_df_property('all_components_section', 'hidden', 0);
        }
        else if (frm.doc.for_material_packaging__blending === "Blending") {
            frm.set_df_property('mts_number', 'hidden', 0);
            frm.set_df_property('work_order_split_number', 'hidden', 1);
            frm.set_df_property('work_order_number', 'read_only', 0);
            frm.set_df_property('all_components_section', 'hidden', 1);
        }
        else {
            frm.set_df_property('work_order_split_number', 'read_only', 1);
            frm.set_df_property('work_order_number', 'read_only', 1);
        }
        filter_child_table_items(frm);
    },

    get_material_stock: function(frm) {
        frappe.call({
            method: "warehousing.warehousing.doctype.work_order_comp_issued.work_order_comp_issued.search_and_reserve_stock", 
            args:{site: frm.doc.site, summary_items: frm.doc.item_summary_to_issued, item_status: "P-GOOD"}, 
            freeze: true, 
            freeze_message: __("Sedang memproses Work Order..."),
            callback: function(r) {
                if (r.message) {
                    frm.clear_table('item_issued');
                    for (let dt of r.message) {
                        let row = frm.add_child('item_issued');
                        row.part = dt.part;
                        row.um = dt.um;
                        row.description = dt.description;
                        row.item_group = dt.item_group;
                        row.quantity = dt.quantity;
                        row.from_location = dt.from_location; 
                        row.lot_serial = dt.lot_serial;

                    }
                    frm.refresh_field('item_issued');
                }
            }
        });
    },

    /* work_order_split_number: function(frm) {
        frm.trigger('get_work_order_details');
    }, */

    work_order_number: function(frm) {
        frm.trigger('fetch_workorder_from_qad');
    },
    
    display_work_order_details: function(frm) {
        let container = frm.get_field('html_wo_detail').$wrapper;
    },

    get_work_order_details: function(frm) {
        if (frm.doc.work_order_split_number) {
            frappe.call({
                method: 'warehousing.warehousing.doctype.work_order_comp_issued.work_order_comp_issued.get_lotserial_issue_details',
                args: {
                    work_order_split_number: frm.doc.work_order_split_number
                },
                callback: function(r) {
                    if (r.message) {
                        let details = r.message.details;
                        let work_order_split_detail = r.message.work_order_split;
                        frm.clear_table('item_issued');

                        details.forEach(d => {
                            let row = frm.add_child('item_issued');
                            row.part = d.item;
                            row.um = d.um;
                            row.description = d.description;
                            row.lot_serial = d.lotserial;
                            row.quantity = d.quantity;
                            row.from_location = d.location; 
                            row.item_group = d.item_group;
                            row.has_weighinged = d.has_weighinged;
                            row.has_blendinged = d.has_blendinged;
                        });

                        //alert(work_order_split_detail.length);
                        if (work_order_split_detail.length > 0) {
                
                                let html = `
                                <table class="table table-bordered" style="font-size: 13px;">
                                    <thead class="bg-light">
                                        <tr>
                                     <tbody>`;

                                let item_rows = work_order_split_detail.map((item, index) => `
                                    <tr>
                                        <td>${index + 1}</td>
                                        <td>${item.part || ''}</td>
                                         <th>No.</th>
                                            <th>Part</th>
                                            <th>Description</th>
                                            <th>UM</th>
                                            <th>Full Required</th>
                                            <th>Full Issued</th>
                                            <th>Act. Needed</th>
                                            <th>Qty Confirmed</th>
                                            <th>Qty Fulfilled</th>
                                        </tr>
                                    </thead>
                                          <td>${item.description || ''}</td>
                                        <td>${item.um || ''}</td>
                                        <td class="text-right"><strong>${item.qty_required || 0}</strong></td>
                                        <td class="text-right">${item.qty_issued || 0}</td>
                                        <td class="text-right">${item.actual_required || 0}</td>
                                        <td class="text-right">${item.qty_confirm || 0}</td>
                                        <td class="text-right">${item.qty_fulfilled || 0}</td>
                                    </tr>
                                `).join('');

                                html += item_rows; 
                                html += `</tbody></table>`;
                                
                                container.html(html);
                        } 
                        else {
                            container.html('<div class="text-muted p-3">Data detail tidak ditemukan.</div>');
                        }

                        frm.refresh_field('item_issued');
                    }
                }
            });
        }
    },

    qty_product_completed_to_be_issued: function(frm) {
        frappe.call({
            method: "warehousing.warehousing.allAPI.get_simulated_picklist_item", 
            args:{workOrder:frm.doc.work_order_number, site: frm.doc.site, part:frm.doc.finish_good, qty:frm.doc.qty_product_completed_to_be_issued, domain: "SMII"}, 
            freeze: true, 
            freeze_message: __("Sedang memproses Work Order..."),
            callback: function(r) {
                if (r.message) {
                    let data = r.message.ttdet_table;
                    data.forEach(api_row => {
                         let target_row = (frm.doc.item_summary_to_issued || []).find(row => row.part === api_row.ttdet_component);
                         if (target_row) {
                            frappe.model.set_value(target_row.doctype, target_row.name, 'qty_needed', api_row.ttdet_qty_req);
                         }
                    });
                }
            }
        });
    },

    fetch_workorder_from_qad(frm){
        let is_packaging = false;
        if (frm.doc.for_material_packaging__blending === "Packaging") {
            is_packaging = true;
        }

        frappe.call({
            method: "warehousing.warehousing.allAPI.get_workorder_from_qad", 
            args:{work_order: frm.doc.work_order_number, domain: "SMII", is_packaging: is_packaging, work_order_comp_issued_name: frm.doc.name}, 
            freeze: true, 
            freeze_message: __("Sedang memproses Work Order..."),
            callback: function(r) {
                if (r.message) {
                    let data = r.message.dsWOResponse;
                    let json_string = JSON.stringify(data, null, 2);
                    frm.set_value("wo_api",json_string);
                    
                    //frm.clear_table('work_order_split_detail');
                    frm.set_df_property('section_break_whir', 'hidden', 0);
                    frm.set_df_property('work_order_detail_section', 'hidden', 0);
                    frm.refresh_field('wo_api');
                    
                    if (data.womstr && data.womstr.length > 0) {
                        let header = data.womstr[0];
                        
                        frm.set_value("site", header.wosite);
                        frm.set_value("work_order_status", header.wostatus);
                        //frm.set_value("work_order", header.wonbr);
                        frm.set_value("id", header.wolot);
                        //frm.set_value("remarks", header.wormks);
                        frm.set_value("finish_good", header.wopart);
                        frm.set_value("fg_description", header.wopart_desc);
                        frm.set_value("um", header.wopart_um);
                        frm.set_value("order_date", header.woord_date);
                        //frm.set_value("release_date", header.worel_date);
                        //frm.set_value("due_date", header.wodue_date);
                        //frm.set_value("fg_qty_per_pallet", header.wopart_qtyperpallet);
                        //frm.set_value("fg_netwt", header.wopart_netwt);
                        frm.set_value("quantity_ordered", header.woqty_ord);
                        frm.set_value("quantity_completed", header.woqty_comp);
                        frm.set_value("quantity_rejected", header.woqty_rjct);
                        frm.set_value("qty_product_completed_to_be_issued", data.total_received || 0);
                    }

                    
                    if (is_packaging){
                        frm.events.render_lotserial_has_been_received(frm, data);
                    }

                    frm.events.render_work_order_detail(frm,  data);
                    frm.events.render_item_summary(frm, data);

                    /* setTimeout(() => { 
                        frm.refresh_field('work_order_split_detail');
                    }, 1000); */
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
    
});

function filter_child_table_items(frm) {
    let filter_value = frm.doc.for_material_packaging__blending;
    let cur_grid = frm.get_field('item_issued').grid;
    frm.doc.item_issued.forEach(row => {
        if (filter_value === "Blending") {
            // Jika Blending, sembunyikan yang BUKAN 'OIL'
            if (row.item_group === "OIL") {
                cur_grid.grid_rows_by_docname[row.name].wrapper.show();
            } else {
                cur_grid.grid_rows_by_docname[row.name].wrapper.hide();
            }
        } else {
            // Jika 'ALL' atau pilihan lain, tampilkan semua baris
            cur_grid.grid_rows_by_docname[row.name].wrapper.show();
        }
    });

    // Refresh grid agar tampilan terupdate
    frm.refresh_field('item_issued');
}
