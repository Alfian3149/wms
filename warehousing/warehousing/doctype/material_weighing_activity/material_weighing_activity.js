// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt
frappe.ui.form.on("Material Weighing Activity", {
 	refresh(frm) {
            frm.set_df_property('summary_weighing_items', 'cannot_add_rows', true);

 	},

    production_qty:function(frm){
        if (frm.doc.work_order && frm.doc.production_qty){
            frm.trigger('fetch_workorder_from_qad');
        }

    },

    fetch_workorder_from_qad(frm){
        frappe.call({
            method: "warehousing.warehousing.allAPI.get_workorder_from_qad", 
            args:{work_order: frm.doc.work_order, domain: "SMII",work_order_comp_issued_name:"", is_blending: true, production_qty:frm.doc.production_qty}, 
            freeze: true, 
            freeze_message: __("Sedang memproses Work Order..."),
            callback: function(r) {
                if (r.message) {
                    let data_wo_obj = r.message.dsWOResponse;
                    //console.log(data_wo_obj)
                    if (data_wo_obj.womstr && data_wo_obj.woddet.length > 0) {
                        frm.clear_table('summary_weighing_items');

                        for (let d of data_wo_obj.woddet) {
                            //const isPackaging = frm.doc.for_material_packaging__blending === "Packaging" && d.item_group === "PACKAGING";
                            const isBlending = d.item_group === "INGREDIENT";
                            if (isBlending) {
                                let row = frm.add_child('summary_weighing_items');
                                row.part = d.wodpart;
                                row.um = d.wodpart_um;
                                row.description = d.wodpart_desc;
                                row.item_group = d.item_group; 
                                row.qty_full_required = d.wodqty_req;
                                row.qty_full_issued = d.wodqty_iss;
                                row.product_line = d.wodprod_line;
                                
                                let match = data_wo_obj.simulated_picklist.find(item => item.ttdet_component === d.wodpart);
                                let qty_needed_val = match ? match.ttdet_qty_req : 0;

                                row.qty_needed = qty_needed_val;
                            }
                            
                        }
                        frm.refresh_field('summary_weighing_items');
                    
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
});

frappe.ui.form.on('Work Order Comp Issued Items', {
    part: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        frappe.db.get_single_value('Part Master', frm.doc.part, 'description')
            .then(value => {
                row.description = value;
                frm.refresh_field('detail_weighing_items');
        })
    }
})
