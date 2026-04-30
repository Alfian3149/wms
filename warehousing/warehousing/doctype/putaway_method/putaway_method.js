// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Putaway Method", {
	refresh(frm) {
        if (frm.doc.drawing_loc){
            frm.trigger('get_items');
        }   
        /* 
        if (frm.doc.unique_key === undefined || frm.doc.unique_key === null || frm.doc.unique_key === "") {
            if (frm.doc.part && frm.doc.warehouse_location) {
                frm.set_value("unique_key", frm.doc.part + "#" + frm.doc.warehouse_location);
                frm.save().then(() => {
                    frappe.show_alert({
                        message: __('Auto-generated Unique Key has been set.'),
                    indicator: 'green'
                });
            });
            } 
        } */
        
	},

    drawing_loc(frm){
        frm.trigger('get_items');
    },

    get_items: function(frm) {
        frappe.db.get_list('Part Master', {
            fields: ['name', 'um', 'description'], 
            filters: {
                'drawing_location': frm.doc.drawing_loc
            },
            //orderby: 'name desc', 
            //limit: 10
        }).then(records => {
            let container = frm.get_field('html_part').$wrapper;
            let html = `
                <table class="table table-bordered" style="font-size: 13px;">
                    <thead class="bg-light">
                        <tr>
                            <th>Part</th>
                            <th>UM</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>`;
            records.forEach(row => {
                let item_rows =  `
                    <tr>
                        <td>${row.name}</td>
                        <td>${row.um}</td>
                        <td>${row.description}</td>
                    </tr>`;

                html += item_rows;
            });

            html += `</tbody></table>`;
                container.html(html);
        })
    },
    get_locations: function(frm) {
        let d = new frappe.ui.form.MultiSelectDialog({
            doctype: "Warehouse Location", // Sesuaikan dengan nama DocType lokasi/warehouse Anda
            target: frm,
            columns: ["name", "total_capacity", "um"],
            setters: {
                // Field untuk filter di bagian atas dialog
                //warehouse_type: null, 
                total_capacity: null, 
                um: null, 
            },
            get_query() {
                // Filter tambahan, misal hanya menampilkan yang bukan group
                return {
                    filters: {
                        is_group: 0
                    }
                };
            },
            action(selections) {
                // 'selections' berisi array ID (name) dari record yang dipilih
                if (selections.length === 0) {
                    frappe.msgprint(__('Pilih setidaknya satu lokasi.'));
                    return;
                }

                // Iterasi setiap lokasi yang dipilih
                selections.forEach(loc => {
                    frappe.db.get_doc("Warehouse Location", loc).then(doc => {
                        let exists = (frm.doc.locations || []).some(d => d.location === doc.name);
                        
                        if (!exists) {
                            let row = frm.add_child('locations');
                            // Sesuaikan 'warehouse' dengan nama field di child table Anda
                            row.location = doc.name; 
                            row.priority = 1; 
                            row.capacity = doc.total_capacity; 
                            row.um = doc.um; 
                            frm.refresh_field('locations');
                        }
                    });
                });

                this.dialog.hide();

            }
        });

        setTimeout(() => {
                if (d.dialog) {
                    d.dialog.get_secondary_btn().hide();
                }
            }, 10);

    }

});
