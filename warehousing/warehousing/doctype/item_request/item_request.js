// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on('Item Request', {
	refresh(frm) {
        frm.set_df_property('items', 'cannot_add_rows', true);
        frm.trigger('reserved_material_detail');
		frm.add_custom_button(__('Confirming Picklist'), function() {
            if (!frm.doc.item_picklist || frm.doc.item_picklist.length === 0) {
                frappe.msgprint({
                    title: __('ERROR'),
                    indicator: 'red',
                    message:__('Tidak terdapat list item pada Item Request. Pastikan Anda telah menjalankan Get Item Stock sebelum konfirmasi picklist.')
                })
                frappe.validated = false;
                return;
            }
           
            let f = new frappe.ui.Dialog({
                title: __('Create Picklist for Item Request {0}', [frm.doc.name]),
                fields: [
                    {
                        label: __('Task Type'),
                        fieldname: 'task_type',
                        fieldtype: 'Select',
                        options: ['Picking', 'Physical Verification', 'Putaway Transfer', 'Putaway'],
                        default: 'Picking',
                        columns: 10,
                        read_only: 1
                    },
                    {
                        label: __('Task ID'),
                        fieldname: 'putaway_transfer_task_id',
                        fieldtype: 'Data',
                        default: frm.doc.putaway_transfer_task_id,
                        columns: 10,
                        read_only: 1
                    },
                    {
                        fieldtype: 'Section Break'
                    },
                    {
                        label: __('Assign To Person'),
                        fieldname: 'assign_to_person',
                        fieldtype: 'Link',
                        options: 'User',
                        columns: 10,
                        default: frm.doc.pt_person_assigned
                    },
                    {
                        label: __('Date Instruction'),
                        fieldname: 'date_instruction',
                        fieldtype: 'Date',
                        columns: 6,
                        default: frm.doc.pt_date_instruction_given ? frm.doc.pt_date_instruction_given : frappe.datetime.get_today()
                    },
                    {
                        fieldtype: 'Column Break'
                    },
        
                    { 
                        label: __('Assign To Role'),
                        fieldname: 'assign_to_role',
                        fieldtype: 'Link',
                        options: 'Role',
                        columns: 6,
                        default: frm.doc.pt_role_assigned
                    },
                    {
                        label: __('Time'),
                        fieldname: 'time',
                        fieldtype: 'Time',
                        columns: 6,
                        default: frm.doc.pt_time_instruction_given ? frm.doc.pt_time_instruction_given : frappe.datetime.now_time()
                    }
                ],
                size: 'medium',
                primary_action_label: __('Submit'),
                primary_action(values) {
                	let dataChildTable = frm.doc.item_picklist.map(row => {
                        return {
                            part: row.part,
                            description: row.description,
                            um: row.um,
                            lot_serial: row.lot_serial,
                            quantity: row.quantity,
                            qty_per_pallet: row.qty_per_pallet,
                            amt_pallet: row.amt_pallet,
                            from_location: row.from_location,
                            to_location: row.to_location,
                        };
                    });
                    frappe.call({
                        method: "warehousing.warehousing.doctype.item_request.item_request.comfirming_picklist",
                        args: {  
                            item_request_doc: frm.doc.name,
                            child_table: dataChildTable,
                            task_type: values.task_type,
                            assigned_to_person: values.assign_to_person,
                            assigned_to_role: values.assign_to_role,
                            date_instruction: values.date_instruction,
                            time: values.time,
                        },
                        freeze: true,
                        freeze_message: __("Sedang memproses create data picklist..."),
                        callback: function(r) {
                            let results = r.message;
                           
                            if (results.status === "success") {
                                frm.clear_table('item_picklist');
                                frm.refresh_field('item_picklist');
                                //frm.save()
                                frappe.show_alert({
                                    message: __(results.message + ` <a href="/app/warehouse-task/${results.task_name}">View Task</a>`),
                                    indicator: 'green'
                                });
                                f.hide();
                            }
                            
                        }
                    })
                }
            });
            f.show();

           
        });
	},


	get_stock_item(frm) {
        frappe.call({
            method: "warehousing.warehousing.doctype.inventory.inventory.get_fifo_picklist_with_reserved",
            args: {  
                item_request_doc: frm.doc.name,
                item_status: "P-GOOD"
            },
            freeze: true,
            freeze_message: __("Sedang memproses get items..."),
            callback: function(r) {
                let results = r.message;
                if(!results){
                    frappe.msgprint({
                            title: __('ERROR'),
                            indicator: 'red',
                            message: __('There is no stock available for the request')
                        });
                    return;
                }
                frm.clear_table('item_picklist');
                results.forEach(row => {
                    //alert(row.part + ' ' + row.lot_serial);
                    let child = frm.add_child('item_picklist');
                    child.site= row.site;
                    child.part= row.part;
                    child.description = row.description;
                    child.um = row.um;
                    child.qty_per_pallet = row.qty_per_pallet;
                    child.lot_serial = row.lot_serial;
                    child.quantity = row.qty;
                    child.amt_pallet = row.amt_pallet;
                    child.from_location = row.from_location;
                    child.to_location= row.to_location;
                });
                frm.refresh_field('item_picklist');
            }
        })
        
        
    }, 
        
    reserved_material_detail: function(frm) {
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Reserved Task Entry',
                filters: { 'doctype_source': 'Item Request', 'task': frm.doc.name },
                fields: ['site', 'part', 'lot_serial','warehouse_location','qty', 'creation','task'],
                order_by: 'site asc, part asc, lot_serial asc',
            },
            callback: function(r) {
                let container = frm.get_field('reserved_task_entry').$wrapper;
                //alert(JSON.stringify(r.message));
                if (r.message && r.message.length > 0) {
                    let html = `
                        <table class="table table-bordered" style="font-size: 13px;">
                            <thead class="bg-light">
                                <tr>
                                    <th>Request Info</th>
                                    <th>Item Details</th>
                                </tr>
                            </thead>
                            <tbody>`;
                    let item_rows = '';
                    let no = 0;
                    r.message.forEach(row => {          
                        let qty_per_pallet = 0;
                         let amt_pallet = 0;
                        frappe.db.get_value('Part Master', row.part, 'qty_per_pallet')
                            .then(r => {
                                qty_per_pallet = r.message.qty_per_pallet || 0;
                                amt_pallet = Math.ceil(row.qty / qty_per_pallet);
                            });
                                
                        //alert('qty_per_pallet: ' + qty_per_pallet);
                        let format_user = frappe.datetime.str_to_user(row.creation);
                        item_rows += `
                                <tr>
                                
                                    <td>${++no}</td>
                                    <td>${row.site || ''}</td>
                                    <td>${row.part || ''}</td>
                                    <td>${row.lot_serial || ''}</td>
                                    <td>${row.warehouse_location || ''}</td>
                                    <td class="text-right">${row.qty || 0}</td>
                                    <td class="text-right">${amt_pallet || 0}</td>
                                </tr>
                            `;
                    });   
                        html += `
                            <tr>
                                <td class="bg-light" style="width: 30%;">
                                    <b><a href="/app/material-incoming/"></a></b><br>
                                    <small></small><br>
                                    <span class="label label-info"></span>
                                </td>
                                <td style="padding: 0;">
                                    <table class="table table-sm mb-0" style="border:none;">
                                        <thead>
                                            <tr class="text-muted small">
                                                <th>No.</th>
                                                
                                                <th>Site</th>
                                                <th>Item</th>
                                                <th>Lotserial</th>
                                                <th class="text-right">Original Loc</th>
                                                <th>Qty</th>
                                                <th>Amt(Pallet)</th>
                                                <th>Current Loc</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${item_rows}
                                        </tbody>
                                    </table>
                                </td>
                            </tr>`;
                    
                    //alert(item_rows);
                    html += `</tbody></table>`;
                    container.html(html);
                } else {
                    container.html('<div class="text-muted p-3">Belum ada riwayat kedatangan.</div>');
                }
            }
        });
    },
})