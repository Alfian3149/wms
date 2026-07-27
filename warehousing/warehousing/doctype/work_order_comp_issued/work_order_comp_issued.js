// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Work Order Comp Issued", {
    onload: function(frm) {
        frm.page.clear_primary_action();
        frm.set_df_property('mts_number', 'hidden', 1);
        filter_child_table_items(frm);
        frm.set_df_property('work_order_split_number', 'read_only', 1);
        
        frm.set_df_property('section_break_whir', 'hidden', 1);
        frm.set_df_property('work_order_detail_section', 'hidden', 1);

        frm.fields_dict['item_issued'].grid.cannot_add_rows = true;


        let btn = frm.get_field('get_material_stock').$wrapper.find('button');

        btn.on('mouseenter', function() {
            $(this).css('background-color', '#171717');
        }).on('mouseleave', function() {
            $(this).css('background-color', '#090909');
        });

    },
    refresh(frm) {
        if(!frm.is_new()){
            frm.set_df_property('production_activity_to_be_carried_out', 'read_only', true);
        }
        frm.get_field('item_issued').grid.cannot_add_rows = true;
        frm.set_df_property('item_issued', 'cannot_delete_rows', true);
        frm.refresh_field('item_issued');

        frm.set_df_property('item_summary_to_issued', 'cannot_add_rows', true);
        frm.refresh_field('item_summary_to_issued');
        frm.fields_dict['item_summary_to_issued'].grid.wrapper.find('.grid-row-checkbox').hide();
        frm.fields_dict['item_summary_to_issued'].grid.wrapper.find('.row-check').hide();
        
        frm.set_df_property('get_material_stock', 'hidden', 1);
        
        if (frm.doc.docstatus === 1){
            frm.page.clear_secondary_action();
        }
    
        frm.add_custom_button(__('Entry Via Scanner'), function() {
            if (frm.doc.docstatus === 1){
                frappe.msgprint("This function only available for new document");
                return;   
            }
            if (frm.doc.production_activity_to_be_carried_out === "" || frm.doc.production_activity_to_be_carried_out === undefined){
                frappe.msgprint("Please select prodction activity first..");
                return;
            }
            else if (frm.doc.production_activity_to_be_carried_out !== "Weighing"){
                frappe.msgprint("Entry scanner can only active for weighing process");
                return;
            }

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
                        fieldtype: "Column Break"
                    },
                    {
                        label: 'Qty',
                        fieldname: 'scan_qty',
                        fieldtype: 'Float',
                        in_focus: 1,
                    },
                    {
                        fieldtype: "Section Break" 
                    },
                    {
                        label: 'Barcode Temporary',
                        fieldname: 'scan_temporary',
                        fieldtype: 'Data',
                        hidden:1,
                        in_focus: 1
                    },
                    {
                        fieldtype: 'HTML',
                        fieldname: 'scan_list_html',    
                        label: 'Daftar Scan'
                    }
                ],
                size: 'extra-large',
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
                        //const total_qty = scanned_qty.filter(row => row.item_code === barcode.item_code).reduce((total, row) => total + flt(row.quantity_scanned), 0);
                        const total_qty = barcode.qty_scanned;

                        all_scanned.push({
                            ...barcode,             // mengambil "item_code"
                            details: weighing_found // memasukkan array hasil filter
                        });

                        let row = frm.add_child('item_issued'); 
                        frappe.model.set_value(row.doctype, row.name, 'part', barcode.item_code);
                        frappe.model.set_value(row.doctype, row.name, 'item_group', barcode.item_code);
                        frappe.model.set_value(row.doctype, row.name, 'description', barcode.description);
                        frappe.model.set_value(row.doctype, row.name, 'um', barcode.um);
                        frappe.model.set_value(row.doctype, row.name, 'lot_serial', barcode.lotserial);
                        frappe.model.set_value(row.doctype, row.name, 'quantity', flt(total_qty));
                        frappe.model.set_value(row.doctype, row.name, 'from_location', barcode.in_location);
                        frappe.model.set_value(row.doctype, row.name, 'weighing_scanned', JSON.stringify(all_scanned, null, 2) );
                        
                    });
                    
                    frm.refresh_field('item_issued');
                    recalculate_summary(frm);

                    frm.save()
                    d.hide();
                }
            });

            // Fungsi untuk memperbarui tampilan tabel di dalam Dialog
            const render_scan_list = () => {
                
                let html = `<table class="table table-bordered table-striped" style="border-radius: 8px; overflow: hidden; border-collapse: separate; border-spacing: 0;">
                <thead >
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
                            <tr style="font-weight: bold;">
                                <td colspan="2">
                                    ${code} - ${group.description} <span style="color: #1a73e8;">(Qty Required: ${format_number(group.qty_needed)} ${group.um || 'UNIT'}) </span>
                                </td>
                            </tr>
                        `;

                        // Baris Detail Lot (Hanya menampilkan yang unik)
                        group.details.forEach((item) => {
                            html += `
                                <tr>
                                    <td style="padding-left: 30px;">• Lot/Serial: ${item.lotserial} Qty Available: ${format_number(item.qty_lot_available)}  </td>
                                    <td style="text-align: right;">
                                     <input type="number" id="qty-scanned-input" class="form-control text-right" value="${flt(item.qty_scanned)}" readonly style="font-weight: bold;">
                                    </td>
                                </tr>
                            `;
                        });

                        // Baris Total per Barang
                        html += `
                            <tr style="font-weight: bold;">
                                <td style="text-align: right; color: #6c757d;">Total :</td>
                                <td style="text-align: right; border-top: 1px solid #dee2e6;">
                                <input type="number" id="total-qty-scanned-input" class="form-control text-right" value="${group.total_qty}" readonly style="font-weight: bold;">
                                
                                </td>
                            </tr>
                        `;
                    }
                }
                
                html += `</tbody></table>`;
                d.get_field('scan_list_html').$wrapper.html(html);
            };

            let $barcode_field = d.get_field('scan_input').$wrapper.find('input');
            let $qty_field = d.get_field('scan_qty').$wrapper.find('input');
            
            let qtyAvailable = 0;
            let locationAvailable = "WH04";
            // Menangani input dari Scanner (Enter)
            $barcode_field.on('keydown', function(e) {
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
  
                        const row_found = frm.doc.item_summary_to_issued.find(row => row.part === item)

                        if (row_found) {
                            frappe.call({
                                method: "warehousing.warehousing.doctype.work_order_comp_issued.work_order_comp_issued.get_inventory_clean_for_production",
                                args: {
                                    site: "1000",
                                    item: item,
                                    lotserial: lotSerial,
                                    status: "P-GOOD",
                                    qty_needed:0,
                                },
                                callback: function(r) {
                                    if(r.message.status == "failed"){
                                        frappe.show_alert({
                                            message:__("Stock tidak ditemukan untuk item#lotserial yang sudah di scan di area produksi."),
                                            indicator:'red'
                                        },2);
                                        $barcode_field.focus().select();
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }
                                    else{
                                        const double_scanned_weigh = scanned_items.find(row => row.item_code === item && row.lotserial === lotSerial);
                                        qtyAvailable = flt(r.message.inventory[0].qty_handovered) - flt(r.message.inventory[0].qty_reserved) ;
                                        locationAvailable = r.message.inventory[0].warehouse_location;
                                        if (double_scanned_weigh) {
                                            d.set_value('scan_temporary', val);
                                            frappe.show_alert({
                                                message:__("Modifikasi data.."),
                                                indicator:'green'
                                            },2);
                                        }
                                        else{
                                            d.set_value('scan_input', '');

                                            d.set_value('scan_temporary', val);
                                            
                                            const row_found = frm.doc.item_summary_to_issued.find(row => row.part === item)
                                            scanned_items.push({ item_code: item, description: row_found.description, um:row_found.um, lotserial:lotSerial, qty_needed: row_found.qty_needed, qty_lot_available:qtyAvailable, qty_scanned: flt(0), in_location:locationAvailable,  no: scanned_items.length + 1 });
                                            render_scan_list();
                                        }
                                        
                                        setTimeout(() => {
                                            $qty_field.focus().select();
                                            d.set_value('scan_input', '');
                                            d.set_value('scan_qty', '');
                                        }, 100);
                                    }
                                }
                                
                            });

      
                        }
                        else { 
                            d.set_value('scan_input', '');
                            frappe.show_alert({
                                message:__("Item {0} dengan Lot {1} bukan material produksi untuk produksi ini", [item,lotSerial]), indicator:'red'},2);
         
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    }
                    else {      
                        frappe.show_alert({
                            message:__("Format Barcode tidak dikenal"),
                            indicator:'red'
                        },2);
                        d.set_value('scan_input', '');
                        $barcode_field.focus();
                        
                    }

                }
            });

            // 2. EVENT: Ketika USER menekan ENTER di field QTY
            $qty_field.on('keydown', function(e) {
                if (e.which === 13) { // Enter key
                    e.preventDefault();

                    let raw_val = $(this).val();
                    let qty_val = frappe.formatters.parse(raw_val, { fieldtype: 'Float' }) || 0;
                    let val = d.get_value('scan_temporary');

                    if(val === undefined || val === null || val === ''){
                        d.set_value('scan_qty', '');
                        frappe.show_alert({
                            message:__("Anda belum scan barcode."),
                            indicator:'red'
                        })
                        return false;   
                    }
                    const scan = val.split("#");
                    const item = scan[0];      // "ITEM12345"
                    const lotSerial = scan[1]; // "LOT98765"
                    
                    if (qty_val > flt(qtyAvailable)){
                        frappe.show_alert({
                            message:__("Qty input lebih besar daripada stok yang tersedia"),
                            indicator:'red'
                        })
                         return false;   
                    }
                    const existing_item = scanned_items.find(row => row.item_code === item && row.lotserial === lotSerial);
                    if (existing_item) {
                        existing_item.qty_scanned = qty_val;
                        d.set_value('scan_input', '');
                        d.set_value('scan_temporary', '');
                        d.set_value('scan_qty', '');

                        render_scan_list();
                        setTimeout(() => {
                            $barcode_field.focus();
                        }, 50);
                        return false;   
                    }
                    else {

                        d.set_value('scan_input', '');
                        d.set_value('scan_temporary', '');
                        d.set_value('scan_qty', '');
                        
                        setTimeout(() => {
                            $barcode_field.focus();
                        }, 50);

                        return false;  

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

        if(frm.doc.production_activity_to_be_carried_out === "Packaging"){
            frm.set_df_property('qty_product_completed_to_be_issued', 'hidden', 0);
            frm.set_df_property('qty_product_completed_to_be_issued', 'read_only', 1);
        }
        else if(frm.doc.production_activity_to_be_carried_out === "Weighing"){
            //frm.set_df_property('mts_number', 'hidden', 0);
            frm.set_df_property('work_order_split_number', 'hidden', 1);
            frm.set_df_property('qty_product_completed_to_be_issued', 'read_only', 0);
        }
        else{
            frm.set_df_property('wo_weighing_number', 'hidden', 0);
            frm.set_df_property('qty_product_completed_to_be_issued', 'hidden', 0);
            frm.set_df_property('wo_weighing_number', 'read_only', 1);
            frm.set_df_property('qty_product_completed_to_be_issued', 'read_only', 1);
            frm.set_df_property('work_order_split_number', 'hidden', 1);
            frm.set_df_property('all_components_section', 'hidden', 1);    
        }

        frm.set_query('work_order_split_number', function() {
            return {
                filters: {
                    'status': ['!=', 'Completed']
                }
            }; 
        });

        frm.events.sync_grid_selection(frm);

        $(frm.fields_dict['item_issued'].wrapper)
            .off('click', '.grid-row')
            .on('click', '.grid-row', function(e) {
            e.stopPropagation();

            let cdn = $(this).attr('data-name');
            if (!cdn) return;
            let row = frappe.get_doc('Work Order Comp Issued Items', cdn);
            let is_checked = $(this).find('input[type="checkbox"]').prop('checked') ? 1 : 0;
            frappe.model.set_value('Work Order Comp Issued Items', cdn, 'has_blendinged', is_checked);
        });

        frm.set_df_property('work_order_number', 'read_only', 1);

        frm.set_query('wo_weighing_number', function() {
            return {
                filters: {
                    'docstatus':['=', '1'],
                    'production_activity_to_be_carried_out':['=', 'Weighing'],
                    'is_closed':['=', false],
                }
            };
        });

        let d = new frappe.ui.form.MultiSelectDialog({ doctype: "Inventory" });
    },

    before_submit:function(frm){
        if (frm.doc.item_issued.length > 0 && frm.doc.production_activity_to_be_carried_out === 'Blending'){
            const found_unchecked = frm.doc.item_issued.find(row => row.has_blendinged === 0);
            if (found_unchecked){
                frappe.msgprint({
                    title: __('MESSAGE'),
                    indicator: 'red',
                    message: __('There is one line in the material details that is unchecked. Please check it.')
                });
                e.preventDefault();
                e.stopPropagation();
            }
        }

    },

    validate:function(frm){
        if (frm.doc.item_issued.length === 0 ){
            frappe.msgprint({
                title: __('MESSAGE'),
                indicator: 'red',
                message: __('There is no material stock can be processed. This document cannot be saved.')
            });

            e.preventDefault();
            e.stopPropagation();
        }

    },

    wo_weighing_number: async function(frm){
        if (!frm.doc.wo_weighing_number) return;
        frm.clear_table('item_summary_to_issued');
        frm.clear_table('item_issued');

        frm.refresh();
        frappe.dom.freeze(__("Sedang proses verifikasi data..."));

        try {
            let source_doc = await frappe.db.get_doc('Work Order Comp Issued', frm.doc.wo_weighing_number);
            
            if (source_doc) {
                // 2. Kosongkan dulu child table di current page agar tidak menumpuk jika user ganti-ganti ID
                frm.clear_table('item_summary_to_issued');
                frm.clear_table('item_issued');

                // 3. Salin/duplikasi dokumen sumber di memori lokal (untuk me-reset name/ID baris)
                let copied_doc = frappe.model.copy_doc(source_doc);

                // 4. Salin data field utama (Parent) jika dibutuhkan
                // Contoh: frm.set_value('customer', copied_doc.customer);
                frm.set_value('work_order_number', copied_doc.work_order_number);
                frm.set_value('qty_product_completed_to_be_issued', copied_doc.qty_product_completed_to_be_issued);
                frm.set_value('quantity_ordered', copied_doc.quantity_ordered);
                frm.set_value('quantity_completed', copied_doc.quantity_completed);
                frm.set_value('quantity_rejected', copied_doc.quantity_rejected);

                frm.set_value('site', copied_doc.site);
                frm.set_value('order_date', copied_doc.order_date);
                frm.set_value('id', copied_doc.id);
                frm.set_value('work_order_status', copied_doc.work_order_status);
                frm.set_value('finish_good', copied_doc.finish_good);
                frm.set_value('fg_description', copied_doc.fg_description);
                frm.set_value('um', copied_doc.um);
                frm.set_value('wo_api', copied_doc.wo_api);

                frm.set_df_property('section_break_whir', 'hidden', 0);
                frm.set_df_property('qty_product_completed_to_be_issued', 'hidden', 0);
                frm.set_df_property('work_order_detail_section', 'hidden', 0);
                frm.events.render_work_order_detail(frm,  JSON.parse(copied_doc.wo_api));

                if (copied_doc.item_summary_to_issued && copied_doc.item_summary_to_issued.length > 0) {
                    copied_doc.item_summary_to_issued.forEach(source_row => {
                        // Tambah baris baru di child table current page
                        let target_row_summary = frm.add_child('item_summary_to_issued');
                        
                        // Copy semua properti field dari baris sumber ke baris baru
                        // Gunakan Object.assign agar semua kolom tersalin otomatis tanpa ketik satu-satu
                        Object.assign(target_row_summary, source_row);
                        
                        // PENTING: Hapus ID baris lama (name) agar Frappe men-generate ID unik baru saat di-save
                        // 2. WAJIB HAPUS properti internal bawaan dokumen lama
                         /*  delete target_row_summary.name;
                       delete target_row_summary.owner;
                        delete target_row_summary.creation;
                        delete target_row_summary.modified;
                        delete target_row_summary.modified_by;
                        delete target_row_summary.parent;
                        delete target_row_summary.parentfield;
                        delete target_row_summary.parenttype; */
                        delete target_row_summary.idx;
                    
                    });
                }
                if (copied_doc.item_issued && copied_doc.item_issued.length > 0) {
                    copied_doc.item_issued.forEach(source_row => {
                        let target_row_detail = frm.add_child('item_issued');
                        Object.assign(target_row_detail, source_row);
                        
                        /* delete target_row_summary.name;
                        delete target_row_detail.owner;
                        delete target_row_detail.creation;
                        delete target_row_detail.modified;
                        delete target_row_detail.modified_by;
                        delete target_row_detail.parent;
                        delete target_row_detail.parentfield;
                        delete target_row_detail.parenttype; */
                        delete target_row_detail.idx;
                    });
                }

               
                
            }
        } catch (error) {
            console.error(error);
            frappe.msgprint(__("Gagal mengambil data dokumen sumber. Pastikan ID benar."));
        } finally {
            setTimeout(() => {
                frm.refresh_field('item_summary_to_issued');
                frm.refresh_field('item_issued');
                frappe.dom.unfreeze();
            }, 1500); 
        }
    },

    render_lotserial_has_been_received: function(frm, data) {
        let data_wo_obj = data || frm.doc.wo_api ? JSON.parse(frm.doc.wo_api) : {};
        if (data_wo_obj.tt_fg_rct && data_wo_obj.tt_fg_rct.length > 0) {
            
            let container = frm.get_field('lotserial_has_received').$wrapper;
                 let html = `
                    <table class="table table-bordered table-striped" style="font-size: 13px;">
                        <thead>
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
                    <table class="table table-bordered table-striped" style="font-size: 13px;">
                        <thead >
                            <tr>
                               <th>No.</th>
                                <th>Part</th>
                                <th>Description</th>
                                <th>UM</th>
                                <th>Item Group</th>
                                <th class="text-right">Full Required</th>
                                <th class="text-right">Has Been Issued</th>
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

            let isAnyRow = false;
            for (let d of data_wo_obj.woddet) {
                const isPackaging = frm.doc.production_activity_to_be_carried_out === "Packaging" && d.item_group === "PACKAGING";
                const isBlending = frm.doc.production_activity_to_be_carried_out === "Blending" && d.item_group === "INGREDIENT";
                const isWeighing = frm.doc.production_activity_to_be_carried_out === "Weighing" && d.item_group === "INGREDIENT";
                if (isPackaging || isBlending || isWeighing) {
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

                    isAnyRow = true;
                    //row.qty_needed = qty_needed_val;
                }
                 
            }

            if (isAnyRow === false){
                frappe.msgprint({
                    title: __('MESSAGE'),
                    indicator: 'red',
                    message: __('There is no material data will be processed in this activity. Please select other activity.')
                });
                e.preventDefault();
                e.stopPropagation();
            }
            frm.refresh_field('item_summary_to_issued');
        
        }
    },

    production_activity_to_be_carried_out: function(frm) {
        if (frm.doc.production_activity_to_be_carried_out === "Packaging") {
            frm.set_df_property('qty_product_completed_to_be_issued', 'hidden', 0);
            frm.set_df_property('qty_product_completed_to_be_issued', 'read_only', 1);
            frm.set_df_property('work_order_split_number', 'read_only', 1);
            frm.set_df_property('work_order_number', 'read_only', 0);
            frm.set_df_property('all_components_section', 'hidden', 0);
            frm.set_df_property('wo_weighing_number', 'hidden', 1);
        }
        else if (frm.doc.production_activity_to_be_carried_out === "Weighing") {
           // frm.set_df_property('mts_number', 'hidden', 0);
            frm.set_df_property('work_order_split_number', 'hidden', 1);
            frm.set_df_property('work_order_number', 'read_only', 0);
            frm.set_df_property('work_order_number', 'read_only', 0);
            frm.set_df_property('all_components_section', 'hidden', 1);
            frm.set_df_property('qty_product_completed_to_be_issued', 'read_only', 0);
            frm.set_df_property('wo_weighing_number', 'hidden', 1);
        }
        else {
            
            frm.set_df_property('wo_weighing_number', 'hidden', 0);
            frm.set_df_property('wo_weighing_number', 'read_only', 0);
            frm.toggle_reqd('wo_weighing_number', true);
            frm.set_df_property('work_order_split_number', 'read_only', 1);
            frm.set_df_property('work_order_number', 'read_only', 1);
            frm.set_df_property('qty_product_completed_to_be_issued', 'read_only', 1);
            
        }

        ubahLabelKolomChildTable(frm);
        filter_child_table_items(frm);
    },

    get_material_stock: function(frm) {
        if (frm.doc.qty_product_completed_to_be_issued <= 0){
            frappe.msgprint({
                title: __('MESSAGE'),
                indicator: 'red',
                message: __('Please fill Qty Product Completed To be Issued first before run get material stock.')
            });
            e.preventDefault();
            e.stopPropagation();
        }
        frappe.call({
            method: "warehousing.warehousing.doctype.work_order_comp_issued.work_order_comp_issued.search_and_reserve_stock", 
            args:{site: frm.doc.site, summary_items: frm.doc.item_summary_to_issued, item_status: "P-GOOD"}, 
            freeze: true, 
            freeze_message: __("Sedang memproses pencarian material by FIFO Batch..."),
            callback: async function(r) {
                if (r.message) {
                    data = r.message;
                    if (data.status === "success") {
                        for (let dt of data.data) {
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

                        setTimeout(() => {
                            recalculate_summary(frm);
                        }, 1500);
                    }
                    else {
                        frappe.msgprint({
                            title: __('MESSAGE'),
                            indicator: 'red',
                            message: __('There is not material stock for the request in production area. Please do request material to the warehouse.')
                        });
                    }
                }
            }
        });
    },

    /* work_order_split_number: function(frm) {
        frm.trigger('get_work_order_details');
    }, */

    work_order_number: async function(frm) {
        if (frm.doc.production_activity_to_be_carried_out === "Blending") return;
        frm.trigger('fetch_workorder_from_qad');

        if(frm.doc.production_activity_to_be_carried_out !== "Packaging"){
            frm.set_df_property('qty_product_completed_to_be_issued', 'hidden', 0);
            frm.scroll_to_field('qty_product_completed_to_be_issued');
            frm.toggle_reqd('qty_product_completed_to_be_issued', true);
        }
        else {  

            
            frm.toggle_reqd('qty_product_completed_to_be_issued', false);
        }
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
        if (frm.doc.production_activity_to_be_carried_out === "Blending") return;
        if (frm.doc.qty_product_completed_to_be_issued > 0) {
            frappe.call({
                method: "warehousing.warehousing.allAPI.get_simulated_picklist_item", 
                args:{workOrder:frm.doc.work_order_number, site: frm.doc.site, part:frm.doc.finish_good, qty:frm.doc.qty_product_completed_to_be_issued, domain: "SMII"}, 
                freeze: true, 
                freeze_message: __("Sedang memproses perhitungan kebutuhan berdasarkan Quantity produksi..."),
                callback: async function(r) {
                    if (r.message) {
                        let data = r.message.ttdet_table;
                        let promises = [];
                        data.forEach(api_row => {
                            let target_row = (frm.doc.item_summary_to_issued || []).find(row => row.part === api_row.ttdet_component);
                    
                            if (target_row) {
                                let needed = flt(target_row.qty_full_required) - flt(target_row.qty_full_issued); 

                                if(needed < 0) {
                                    needed = 0;
                                }
                                let final_qty = Math.min(needed, api_row.ttdet_qty_req);
                                let p = frappe.model.set_value(target_row.doctype, target_row.name, 'qty_needed', final_qty);
                                promises.push(p);
                            }
                        });
                        //await Promise.all(promises);
                        //frm.events.get_material_stock(frm);
                    }
                }
            });
        }
    },

    fetch_workorder_from_qad(frm){
        let is_packaging = false;
        if (frm.doc.production_activity_to_be_carried_out === "Packaging") {
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
                       
                        if (data.tt_fg_rct.length > 0) {
                            frm.events.render_lotserial_has_been_received(frm, data);
                            setTimeout(() => { 
                                frm.events.get_material_stock(frm);
                            }, 2000);
                            frm.events.render_work_order_detail(frm,  data);
                            frm.events.render_item_summary(frm, data);     
                            
                         }   
                         else {
                            frappe.msgprint({
                                title: __('MESSAGE'),
                                indicator: 'red',
                                message: __('There is no finish good that has been received.')
                            });
                            e.preventDefault();
                            e.stopPropagation();
                         }
                    }
                    else {
                        frm.events.render_work_order_detail(frm,  data);
                        frm.events.render_item_summary(frm, data);     
                    }
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

    sync_grid_selection: function(frm) {
        // Iterasi setiap baris di child table 'items'
        frm.doc.item_issued.forEach(d => {
            // Jika data is_selected bernilai true (1)
            if (d.has_blendinged) {
                // Cari index baris berdasarkan nama/ID baris
                let grid_row = frm.fields_dict['item_issued'].grid.grid_rows_by_docname[d.name];
                
                if (grid_row) {
                    // Berikan centang pada checkbox bawaan secara visual
                    grid_row.select(true);
                }
            }
        });
        
        // Refresh grid untuk memastikan tampilan checkbox terupdate
        frm.fields_dict['item_issued'].grid.refresh();
    },
    
    select_ingredient__packaging_from_inventory:function(frm){
        if (frm.doc.production_activity_to_be_carried_out !== "Packaging") return;

            let d = new frappe.ui.form.MultiSelectDialog({
                doctype: "Inventory",
                target: this.cur_frm,
                columns: ["name", "part", "lot_serial", "warehouse_location", "qty_on_hand"],
                setters: {
                    part: frm.doc.part ? frm.doc.part : null , 
                    lot_serial: null, 
                    warehouse_location: frappe.user.has_role('Production Operator') || frappe.user.has_role('System Manager') ?  "WH04" : null, 
                    qty_on_hand:null,
                }, 
                action(selections) {
                    if (selections.length === 0) {
                        frappe.msgprint(__('You do not have selected row.'));
                        return;
                    }

                    selections.forEach(inventory => {
                        frappe.db.get_doc("Inventory", inventory).then(doc => {
                            if (doc.qty_on_hand <= 0){
                                frappe.msgprint(__('Inventory selected does not have stock'));
                                return;
                            }

                            if (doc.warehouse_location === 'WHO4'){
                                const row_exist = frm.doc.item_issued.find(row => row.part === doc.part && row.lot_serial === doc.lot_serial && row.from_location === doc.warehouse_location);
                                console.log(row_exist);
                                if (!row_exist) {
                                    const is_item_match = frm.doc.item_summary_to_issued.find(item => item.part === doc.part);
                                    if (is_item_match) {
                                        let target_row_summary = frm.add_child('item_issued');
                                        target_row_summary.part = doc.part;
                                        target_row_summary.um = doc.um;
                                        target_row_summary.lot_serial = doc.lot_serial;
                                        target_row_summary.from_location = doc.warehouse_location;
                                        target_row_summary.item_group = is_item_match.item_group;

                                        frappe.db.get_value("Part Master", doc.part, "description").then(value => {
                                            target_row_summary = value.message.description;
                                        })
                                        
                                    }
                                    
                                }
                            }

                        })

                    })
                    frm.refresh_field('item_issued');
                    d.dialog.hide();

                    
                }
            })
            d.dialog.get_secondary_btn().hide();
    }
});

frappe.ui.form.on('Work Order Comp Issued Items', {
    quantity:async function(frm, cdt, cdn){
        let row = locals[cdt][cdn];
        
        let qtyAvailable = 0;
        let isNotOk = false;

        console.log(row.quantity );
        await frappe.db.get_value("Inventory", {"part": row.part, "lot_serial": row.lot_serial, "warehouse_location": row.from_location}, ["qty_on_hand", "qty_handovered", "qty_reserved"]).then(doc => {
            qtyAvailable = flt(doc.message.qty_handovered) - flt(doc.message.qty_reserved);
            if (row.quantity > qtyAvailable) {
                isNotOk =  true;
            }
        
            if (isNotOk) {
                frappe.msgprint({
                    title: __('MESSAGE'),
                    indicator: 'red',
                    message: __('Qty input over than allowed to issued. Maximal Qty allowed to issued is ' + String(qtyAvailable) )
                });
                reset_row_qty(frm, row); 
                frappe.validated = false;
            }
        })

        const newTotalQty = total_qty_by_item(frm, row.part);
        (frm.doc.item_summary_to_issued || []).forEach(s => {
            if (s.part === row.part) {
                s.fulfillment_qty = newTotalQty;
            }
        });

        frm.refresh_field('item_summary_to_issued');
  
    },
    item_details_add: function(frm, cdt, cdn) {
        recalculate_summary(frm);
    },

});


function total_qty_by_item(frm, item_passed){
    const totalQty =  frm.doc.item_issued.reduce((qty, row) => {
        return row.part === item_passed ? qty + row.quantity :  qty;
    }, 0);

    return totalQty;

}   

function recalculate_summary(frm) {
    let akumulasi_stok = {};

    // Baca data dari tabel detail yang baru saja terisi oleh script
    (frm.doc.item_issued || []).forEach(detail_row => {
        if (detail_row.part && detail_row.quantity) {
            if (!akumulasi_stok[detail_row.part]) {
                akumulasi_stok[detail_row.part] = 0;
            }
            akumulasi_stok[detail_row.part] += flt(detail_row.quantity);
        }
    });

    // Perbarui tabel summary
    for (let item in akumulasi_stok) {
        let summary_row = cur_frm.doc.item_summary_to_issued.find(row => row.part === item);
        frappe.model.set_value(summary_row.doctype, summary_row.name, 'fulfillment_qty', akumulasi_stok[item]);
    }
    frm.refresh_field('item_summary_to_issued');
}

function filter_child_table_items(frm) {
    let filter_value = frm.doc.production_activity_to_be_carried_out;
    let cur_grid = frm.get_field('item_issued').grid;
    frm.doc.item_issued.forEach(row => {
        if (filter_value === "Weighing") {
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

// Fungsi untuk memanggil pop-up modal
function bukaModalCustom(frm) {
    let d = new frappe.ui.Dialog({
        title: 'Masukkan Data Item',
        fields: [
            {
                label: 'Pilih Item',
                fieldname: 'item_code',
                fieldtype: 'Link',
                options: 'Item',
                reqd: 1
            },
            {
                label: 'Quantity',
                fieldname: 'qty',
                fieldtype: 'Int',
                default: 1,
                reqd: 1
            }
        ],
        primary_action_label: 'Tambahkan ke Tabel',
        primary_action(values) {
            // 3. Ambil data dari modal, lalu masukkan secara manual ke child table
            let row = frm.add_child('nama_child_table_kamu');
            row.item_code = values.item_code;
            row.qty = values.qty;
            
            // Refresh field child table agar data baru muncul di layar
            frm.refresh_field('nama_child_table_kamu');
            
            d.hide(); // Tutup modal
        }
    });

    d.show();
}

function ubahLabelKolomChildTable(frm) {
    let kolom_qty = frm.get_field('item_issued').grid.get_field('quantity');
    
    if (kolom_qty) {
        // 2. Berikan kondisi dinamis
        if (frm.doc.production_activity_to_be_carried_out === 'Packaging') {
            kolom_qty.df.label = __('Qty To Issue');
        } else {
            kolom_qty.df.label = __('Weighed Qty'); 
        }
        
        frm.fields_dict['item_issued'].grid.refresh();
    }
}

function reset_row_qty(frm, row) {
    row._resetting = true;
    frappe.model.set_value(row.doctype, row.name, 'quantity', row.old_qty_to_issue);
    setTimeout(() => { frm.refresh_field('item_issued');}, 50);
};