frappe.pages['weighing-confirmatio'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Production Confirmation',
		single_column: true
	});

	let container = $(wrapper).find('.layout-main-section');
	
	container.append(`
        <div id="dashboard-content" class="p-3">
            <div id="wo-list-area">
                <h4>Work Order List</h4>
                <table class="table table-bordered table-hover">
                    <thead>
                        <tr>
							<th>Work Order</th>
							<th>Finish Good</th>
							<th>Description</th>
							<th>Due Date</th>
							<th>Quantity</th>
							<th>Status</th>
							<th>Aksi</th>
                        </tr>
                    </thead>
                    <tbody id="wo-split-list"></tbody>
                </table>
            </div>

            <div id="weighing-area" style="display:none;font-size: 1.2em;">
                <button class="btn btn-sm btn-default mb-3" onclick="back_to_list()">⬅ Kembali ke Daftar</button>
                <h4 id="selected-wo-title"></h4>
                <div class="card p-3">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Lot/Batch</th>
                                <th>Qty</th>
                                <th class="text-center">Serah Terima?</th>
                                <th class="text-center">Selesai Timbang?</th>
                                <th class="text-center">Selesai Blending?</th>
                            </tr>
                        </thead>
                        <tbody id="weighing-items-body"></tbody>
                    </table>
                    <button class="btn btn-primary mt-3" onclick="submit_weighing()">Simpan & Selesaikan Timbang</button>
                </div>
            </div>
        </div>
    `);

    load_work_orders();
};

// 2. Load Daftar Work Order
window.load_work_orders = function() {
	
    $('#wo-list-area').show();
    $('#weighing-area').hide();
    
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Work Order Split',
            fields: ['name', 'status','finish_good', 'fg_description', 'quantity_to_be_produced_immediately','due_date'],
			filters: { 'status': ['in', ['Ready for Weighing', 'Ready for Blending', 'In Weighing', 'Blending Completed']] },
        },
        callback: function(r) {
            let tbody = $('#wo-split-list').empty();
            r.message.forEach(doc => {
                let indicator_class = "grey"; // Default
                    
                if (doc.status === 'Ready for Weighing' || doc.status === 'In Weighing') {
                    indicator_class = "blue";
                } else if (doc.status === 'Ready for Blending') {
                    indicator_class = "orange";
                } else if (doc.status === 'Blending Completed') {
                    indicator_class = "green";
                }

                let action_button = "";
                if (doc.status === 'Ready For Weighing' || doc.status === 'In Weighing') {
                    action_button = `<button class="btn btn-sm btn-primary" onclick="open_weighing('${doc.name}')">Timbang</button>`;
                }
                else if (doc.status === 'Ready For Blending') {
                    action_button = `<button class="btn btn-sm btn-primary" onclick="open_weighing('${doc.name}')">Blending</button>`;
                }
                else {
                    action_button = `<button class="btn btn-sm btn-secondary" disabled>Selesai</button>`;
                }

                tbody.append(`
                    <tr>
                        <td><strong>${doc.name}</strong></td>
                        <td><strong>${doc.finish_good}</strong></td>
                        <td><strong>${doc.fg_description}</strong></td>
                        <td>${doc.due_date}</td>
                        <td>${doc.quantity_to_be_produced_immediately}</td>
                        <td>
                            <span class="indicator ${indicator_class}"></span>
                            <strong>${doc.status}</strong>
                        </span>
                        </td>
                        <td>${action_button}
                        </td>
                    </tr>
                `);
            });
        }
    });
};
 
// 3. Load Detail Item (Langsung Tampil di Page)
window.selected_wo = "";
window.open_weighing = function(wo_name) {
    window.selected_wo = wo_name;
    $('#wo-list-area').hide();
    $('#weighing-area').show();
    $('#selected-wo-title').text("Memproses: " + wo_name);

    frappe.call({
        method: 'frappe.client.get_value',
        args: {
            doctype: 'Work Order Split',
            filters: { 'name': wo_name, 'docstatus': 1 },
            fieldname: 'link_to_item_request'
        },
        callback: function(r) {
            if (r.message) {
                //alert("Item Request: " + r.message.link_to_item_request);
                render_items(r.message.link_to_item_request);
            }
        }
    });
};

function render_items(item_request_name) {
    let tbody = $('#weighing-items-body').empty();
    
    // Tampilkan loading sementara
    tbody.append('<tr><td colspan="4" class="text-center">Memuat data...</td></tr>');

    frappe.call({
        // Ganti 'your_app.api.get_warehouse_task_items' sesuai lokasi file python Anda
        //method: "warehousing.api.get_warehouse_task_items", 
        method: "warehousing.warehousing.doctype.warehouse_task.warehouse_task.get_warehouse_task_items",
        args: {
            item_request_name: item_request_name
        },
        callback: function(r) {
            tbody.empty(); // Bersihkan loading
            
            let details = r.message || [];
            
            if (details.length > 0) {
                details.forEach((item) => {
                    tbody.append(`
                        <tr>
                            <td>
                                <strong>${item.item}</strong><br>
                                <small class="text-muted">${item.description || ''}</small>
                            </td>
                            <td>
                                <span class="badge badge-warning" style="background-color: #f39c12; color: white; padding: 2px 5px; border-radius: 4px;">
                                    ${item.lotserial || '-'}
                                </span>
                            </td>
                            <td>${item.qty_label}  ${item.um}</td>
                            <td class="text-center">
                                ${item.has_handovered ? '<span class="badge badge-success">Pass</span>' : '<span class="badge badge-warning">Not Yet</span>'}
                            </td>
                            <td class="text-center">
                                ${item.has_handovered ? (item.has_weighinged ? '<span class="badge badge-success">Pass</span>' : '<input type="checkbox" class="weighing-check" style="transform: scale(1.5); margin: 20px;" data-item="${item.name}">') : ''}
                            </td>
                            <td class="text-center">
                                ${item.has_weighinged ? (item.has_blendinged ? '<span class="badge badge-success">Pass</span>' : '<input type="checkbox" class="blending-check" style="transform: scale(1.5); margin: 20px;" data-item="${item.name}"data-batch="${item.lotserial}" data-qty="${item.qty_label}">') : ''}
                            </td>
                        </tr>
                    `);
                });
            } else {
                tbody.append('<tr><td colspan="4" class="text-center">Data item tidak ditemukan.</td></tr>');
            }
        },
        error: function(r) {
            tbody.empty().append('<tr><td colspan="4" class="text-center text-danger">Terjadi kesalahan akses data.</td></tr>');
        }
    });
}   

function get_status_badge(status) {
    if (status) {
        return '<span class="badge badge-success">Selesai</span>';
    } else if (item.is_picking) {
        return '<span class="badge badge-info">Sedang Pick</span>';
    } else {
        return '<span class="badge badge-warning">Belum</span>';
    }
}

// 4. Submit Data secara Background
window.submit_weighing = function() {
    let checked_items = [];
    let all_checked = true;

    if ($('.weighing-check').length === 0) {
        frappe.msgprint("Tidak ada item yang bisa ditimbang!");
        return;
    }

    $('.weighing-check').each(function() {
        //alert($(this).data('item') + " - " + $(this).data('batch') + " - " + $(this).data('qty') + " - Checked: " + $(this).is(':checked'));
        if (!$(this).is(':checked')) {
            all_checked = false;
        }
        checked_items.push({ 
            item_code: $(this).data('item'),
            batch_no: $(this).data('batch'),
            qty: $(this).data('qty')
        });
    });
   
    if (!all_checked) {
        frappe.msgprint("Semua item harus ditimbang sebelum disimpan!");
        return;
    }
    else {
    // Buat dokumen Konfirmasi Timbang via API
        frappe.call({
            method: 'frappe.client.insert',
            args: {
                doc: {
                    doctype: 'Konfirmasi Timbang',
                    work_order_split: window.selected_wo,
                    status: 'Completed',
                    items: checked_items.map(i => ({
                        item_code: i.item_code,
                        batch_no: i.batch_no,
                        qty_handover: i.qty,
                        sudah_ditimbang: 1
                    }))
                }
            },
            callback: function() {
                frappe.show_alert({message: __('Timbang Berhasil Disimpan'), indicator: 'green'});
                load_work_orders(); // Kembali ke list
            }
        });
    }
};

window.back_to_list = function() {
    $('#wo-list-area').show();
    $('#weighing-area').hide();
};