// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Item Picklist By Part", {
    before_save: function(frm) {
        // 1. Ambil kondisi filter yang sedang aktif
        let all = frm.doc.all;
        let ingredient = frm.doc.ingredient;
        let packaging = frm.doc.packaging;
        let others = frm.doc.others;

        // Jika 'ALL' dicentang, tidak perlu ada data yang dihapus
        if (all === 1) return;

        let active_groups = [];
        if (ingredient === 1) active_groups.push("INGREDIENT");
        if (packaging === 1) active_groups.push("PACKAGING");

        // 2. Lakukan perulangan terbalik (backward loop) untuk menghapus data safely
        // Menggunakan loop terbalik penting agar indeks array tidak bergeser saat ada row yang dihapus
        let i = (frm.doc.selected_item || []).length;
        while (i--) {
            let row = frm.doc.selected_item[i];
            let item_group = (row.item_grouping || "").toUpperCase().trim();
            
            let is_ingredient_or_packaging = active_groups.includes(item_group);
            let is_others = (others === 1 && item_group !== "INGREDIENT" && item_group !== "PACKAGING");

            // 3. Jika baris TIDAK memenuhi kriteria filter aktif (artinya baris tersebut sedang di-hide)
            if (!is_ingredient_or_packaging && !is_others) {
                // Hapus baris dari child table secara permanen sebelum dikirim ke server
                frm.doc.selected_item.splice(i, 1);
            }
        }

        // 4. Refresh field agar tampilan UI sinkron dengan data yang tersisa
        frm.refresh_field('selected_item');
    },
    refresh(frm) {
        frm.set_df_property('selected_item', 'cannot_add_rows', true);
        //frm.fields_dict['selected_item'].grid.cannot_add_rows = true; 
       frm.set_df_property('all', 'read_only', 1);
       frm.set_df_property('ingredient', 'read_only', 1);
       frm.set_df_property('packaging', 'read_only', 1);
       frm.set_df_property('others', 'read_only', 1);


        setTimeout(() => {
            // Targetkan langsung container form control milik select_purpose
            let $container = frm.get_field('purpose').$wrapper.closest('.frappe-control');
            
            $container.css({
                'margin-top': '-20px',  // Sesuaikan angkanya (misal -30px atau -40px) sampai jaraknya pas
                'padding-top': '0px'
            });
            
            // Hilangkan juga margin-bottom dari baris checkbox di atasnya jika ada
            $container.prev().css({
                'margin-bottom': '0px',
                'padding-bottom': '0px'
            });
        }, 100)
    },
    onload(frm) {
        
    },

    purpose:async function(frm) {
        frappe.dom.freeze(__("Sedang proses verifikasi data..."));
        try {
            frappe.call({
                method: "warehousing.warehousing.doctype.item_picklist_by_part.item_picklist_by_part.get_item_request_list",
                args: {
                    purpose: frm.doc.purpose,
                },
                callback: function(r) {
                    if (r.message) {
                        let data = r.message;
                        frm.clear_table('selected_item');
                   
                        data.forEach(row => {
                            let child = frm.add_child('selected_item');
                            child.request_number = row.parent;
                            child.child_name = row.child;
                            child.part = row.part;
                            child.description = row.description;
                            child.site = row.site;
                            child.quantity_requested = row.quantity_requested;
                            child.quantity_picked = row.quantity_picked;
                            child.item_grouping = row.item_group;
                            child.target_location = row.target_location;
                        }); 
                    }
                }
            });
        } catch (error) {
            console.error(error);
            frappe.msgprint(__("Gagal mengambil data dokumen sumber. Pastikan ID benar."));
        } finally {
             setTimeout(() => {
                frm.refresh_field('selected_item');
                frappe.dom.unfreeze();
                frm.set_value('all', 1);
                frm.set_df_property('all', 'read_only', 0);
                frm.set_df_property('ingredient', 'read_only', 0);
                frm.set_df_property('packaging', 'read_only', 0);
                frm.set_df_property('others', 'read_only', 0);
            }, 1000); 
        }
    },

    ingredient(frm) {
        setTimeout(() => {
            frm.set_value('all', 0);
            filter_child_table_items(frm);
        }, 100);
    },
    
    packaging(frm) {
        frm.set_value('all', 0);
        setTimeout(() => {
            filter_child_table_items(frm);
        }, 100);
    },

    others(frm) {
        frm.set_value('all', 0);
        setTimeout(() => {
            filter_child_table_items(frm);
        }, 100);
    },

    all(frm) {
        if (frm.doc.all == 1) {
            frm.set_value('ingredient', 0);
            frm.set_value('packaging', 0);
            frm.set_value('others', 0);
            setTimeout(() => {
                filter_child_table_items(frm);
            }, 100);
        }
    },

    manual_choose(frm) {
        new frappe.ui.form.MultiSelectDialog({
            doctype: "Item Request Detail",
            columns: ["name", "part", "description", "um", "quantity_requested"],
            target: this.cur_frm,
            setters: {
                part: null, 
                um: null, 
                quantity_requested: null
            },
            // Filter default untuk query data (opsional)
           /*  get_query() {
                return {
                    filters: {
                        is_stock_item: 1,
                        disabled: 0
                    }
                };
            }, */
            get_query() {
                return {
                    query: "frappe.desk.search.search_link", // Mengalihkan ke pencarian umum yang lebih fleksibel
                    filters: {
                        parenttype: "Item Request" // Contoh filter ke parent doc-nya
                    }
                };
            },
            // Aksi ketika user menekan tombol "Select"
            action: function(selections) {
                // selections berisi array dari name/ID yang dipilih (contoh: ['ITEM-001', 'ITEM-002'])
                
                selections.forEach(item_code => {
                    // Cek apakah item sudah ada di child table agar tidak duplikat (opsional)
                    let exists = (frm.doc.receipt_items || []).some(d => d.item_code === item_code);
                    
                    if (!exists) {
                        // Tambahkan baris baru ke Child Table
                        let child = frm.add_child('receipt_items');
                        
                        // Isi field di child table berdasarkan data yang dipilih
                        frappe.model.set_value(child.doctype, child.name, 'item_code', item_code);
                    }
                });
                
                // Refresh child table agar muncul di UI
                frm.refresh_field('receipt_items');
                
                // Tutup dialog
                this.dialog.hide();
            }
        });
    }

});

function filter_child_table_items(frm) {
    let all = frm.doc.all;
    let ingredient = frm.doc.ingredient;
    let packaging = frm.doc.packaging;
    let others = frm.doc.others;
    
    if (all === 0 && ingredient === 0 && packaging === 0 && others === 0) {
        all = 1;
        frm.set_value('all', 1);
    }
    let cur_grid = frm.get_field('selected_item').grid;

    // 1. Kumpulkan semua kelompok grup yang sedang aktif
    let active_groups = [];
    if (ingredient === 1) active_groups.push("INGREDIENT");
    if (packaging === 1) active_groups.push("PACKAGING");

    frm.doc.selected_item.forEach(row => {
        let grid_row = cur_grid.grid_rows_by_docname[row.name];
        
        // Lewati jika baris grid belum sempat ter-render di DOM
        if (!grid_row) return;

        let item_group = (row.item_grouping || "").toUpperCase().trim();
        let show_this_row = false;

        // 2. Tentukan status visibilitas baris berdasarkan kombinasi checkbox
        if (all === 1) {
            show_this_row = true;
        } else {
            // Evaluasi apakah baris ini cocok dengan salah satu checkbox yang aktif
            let match_ingredient_or_packaging = active_groups.includes(item_group);
            let match_others = (others === 1 && item_group !== "INGREDIENT" && item_group !== "PACKAGING");

            if (match_ingredient_or_packaging || match_others) {
                show_this_row = true;
            }
        }

        if (grid_row.row) {
            $(grid_row.row).toggle(show_this_row);
        } else if (grid_row.wrapper) {
            $(grid_row.wrapper).toggle(show_this_row);
        }
    });
    setTimeout(() => { frm.refresh_field('selected_item');}, 300);
   
}