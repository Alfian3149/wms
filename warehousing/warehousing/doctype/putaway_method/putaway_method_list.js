frappe.listview_settings['Nama DocType Anda'] = {
    onload: function(listview) {
        // Mengatur sorting lebih dari satu field
        // Formatnya sama seperti SQL: "field1 order, field2 order"
        listview.sort_by = "part asc, warehouse_location asc";
        
        // Pastikan sort_order dikosongkan agar tidak menimpa string di atas
        listview.sort_order = "";
        
        // Refresh untuk menerapkan urutan baru
        listview.refresh();
    }
};