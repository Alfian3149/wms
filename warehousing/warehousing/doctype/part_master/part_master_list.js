frappe.listview_settings['Part Master'] = {
    refresh: function(listview) {
        listview.page.add_inner_button(__('Syncronize Part'), function() {
            frappe.confirm('Data sudah ada akan di timpa dengan data yang didapatkan dari sinkronisasi.Apakah Anda yakin akan melakukan sinkronisasi data?', () => {
                frappe.call({
                    method: "warehousing.warehousing.doctype.material_label.material_label.generate_bulk_print_html",
                    args: {
                        docnames: names,
                        doctype: "Inventory"
                    },
                    freeze: true,
                    freeze_message: __("Preparing Labels..."),
                    callback: function(r) {
                        frappe.msgprint({
                            title: __('Feedback'),
                            message: __([r.message.total_rows], ' rows succesfully updated'),
                        });
                        setTimeout(() => { 
                            listview.refresh();
                        }, 1000);
                       
                    }
                    
                })
            })
        })
    }
}