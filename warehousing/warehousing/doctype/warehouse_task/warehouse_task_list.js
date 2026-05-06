frappe.listview_settings['warehouse_task'] = {
    onload: function(listview) {
        listview.page.clear_primary_action();
    },
    refresh: function(listview) {
        // Jalankan kembali saat refresh untuk memastikan tombol Add tetap hilang
        listview.page.clear_primary_action();
    }

}; 