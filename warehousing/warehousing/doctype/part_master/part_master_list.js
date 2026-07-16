frappe.listview_settings['Part Master'] = {
    refresh: function(listview) {
        listview.page.add_inner_button(__('Syncronize Part'), function() {
            frappe.confirm('Data sudah ada akan di timpa dengan data yang didapatkan dari sinkronisasi.Apakah Anda yakin akan melakukan sinkronisasi data?', () => {
                frappe.call({
                    method: "warehousing.warehousing.doctype.part_master.part_master.get_syncronize_part_master_to_qad",
                    args: {},
                    freeze: true,
                    freeze_message: __("Syncronizing Part Master..."),
                    callback: function(r) {
                        frappe.msgprint({
                            title: __('Information'),
                            message: __('Rows succesfully updated'),
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