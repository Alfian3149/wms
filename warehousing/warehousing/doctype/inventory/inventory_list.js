frappe.listview_settings['Inventory'] = {
    onload: function(listview) {
        // 1. Menghilangkan Sidebar (Filter & Report Builder)
        listview.page.sidebar.hide();

        // 2. Menghilangkan Tombol "Add" (Tambah) di bagian atas
        listview.page.clear_primary_action();
        
        $(".layout-side-section").hide();
        $(".layout-main-section").removeClass("col-lg-10").addClass("col-lg-12");
    },
    
    refresh: function(listview) {
        // Jalankan kembali saat refresh untuk memastikan tombol Add tetap hilang
        listview.page.clear_primary_action();
        listview.page.add_inner_button(__('Print Label'), function() {
            // Mengambil data yang dicentang/dipilih di list
            let selected_items = listview.get_checked_items();

            if (selected_items.length === 0) {
                frappe.msgprint(__('Silakan pilih setidaknya satu item untuk dicetak.'));
                return;
            }

            // Contoh: Mengarahkan ke print format untuk item pertama yang dipilih
            // Jika ingin bulk print, biasanya menggunakan Print Selection bawaan
            let names = selected_items.map(d => d.name);
            
            frappe.call({
                method: "warehousing.warehousing.doctype.material_label.material_label.generate_bulk_print_html",
                args: {
                    docnames: names,
                    doctype: "Inventory"
                },
                freeze: true,
                freeze_message: __("Preparing Labels..."),
                callback: function(r) {
                    if (r.message) {
                        var win = window.open('', '_blank');
                        // Menulis konten secara sinkron agar session cookie tetap terbawa
                        win.document.write(r.message); 
                        win.document.close();
                        
                        // Beri waktu lebih lama (2 detik) untuk loading gambar
                        setTimeout(function() {
                            win.print();
                        }, 2000);
                    }
                }
            });
            

        });

        listview.page.add_inner_button(__('Get Current Stock'), function() {
            frappe.confirm('Konfirmasi ini akan men-delete seluruh existing inventory web sebelum mengambil seluruh inventory dari ERP. Apakah Anda ingin tetap lanjutkan?', () => {
                frappe.call({
                    method: "warehousing.warehousing.inventory_api.get_current_qad_inventory",
                    args: {
                        part: "",
                        bulk_insert: true
                    },
                    freeze: true,
                    freeze_message: __("Get Current Stock..."),
                    callback: function(r) {
                        if (r.message) {
                            // Beri waktu lebih lama (2 detik) untuk loading gambar
                            setTimeout(function() {
                                listview.refresh();
                            }, 2000);
                        }
                    }
                });
            });
        });
    }
}; 