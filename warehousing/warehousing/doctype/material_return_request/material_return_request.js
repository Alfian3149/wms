// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Material Return Request", {
    refresh: function(frm) {
        // Menghilangkan tombol Add Row dan tombol hapus di tiap baris
        frm.get_field('items').grid.cannot_add_rows = true;
        frm.get_field('items').grid.cannot_delete_rows = true;
        
        // Menghilangkan tombol centang massal (bulk actions)
        frm.get_field('items').grid.only_sortable();
        
        frm.refresh_field('items');

        frm.add_custom_button(__('Create Task to Picker'), function() {
            let topicker = new frappe.ui.Dialog({
                title: __('Create Task to picker'),
                fields: [
                    {
                        label: __('Task Type'),
                        fieldname: 'task_type',
                        fieldtype: 'Select',
                        options: ['Picking', 'Physical Verification', 'Putaway Transfer', 'Putaway', 'Material Return'],
                        default: 'Material Return',
                        columns: 10,
                        read_only: 1
                    },
                    {
                        label: __('Task ID'),
                        fieldname: 'phsyical_verification_task_id',
                        fieldtype: 'Data',
                        default: frm.doc.physical_verification_id,
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
                        default: frm.doc.person_assigned
                    },
                    {
                        label: __('Date Instruction'),
                        fieldname: 'date_instruction',
                        fieldtype: 'Date',
                        columns: 6,
                        default: frm.doc.date_instruction_given ? frm.doc.date_instruction_given : frappe.datetime.get_today()
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
                        default: frm.doc.role_assigned
                    },
                    {
                        label: __('Time'),
                        fieldname: 'time',
                        fieldtype: 'Time',
                        columns: 6,
                        default: frm.doc.time_instruction_given ? frm.doc.time_instruction_given : frappe.datetime.now_time()
                    }
                ],
                size: 'medium',
                primary_action_label: __('Submit'),
                primary_action(values) {
                    frappe.db.get_value('Warehouse Task', {'reference_name': cur_frm.doc.name, 'task_type': values.task_type}, 'name')
                    .then(r => {
                        if (r.message.name) {
                            msgprint({
                                title: __('ERROR'),
                                indicator: 'red',
                                message: __('A task for this document already exists: {0}', [r.message.name])
                            });

                            return; 
                        }
                        else{
                            frm.events.create_physical_verification_task(frm, values.task_type, values.assign_to_person, values.assign_to_role, values.date_instruction, values.time);
                            d.hide();
                        }
                    });
                    
                }
            });
            
            topicker.show();
		    
		}, null,'list');		
		frm.add_custom_button(__('Sortir Result Update'), function() {
	      const sortir = new frappe.ui.Dialog({
            title: __("Sortir Result"),
            fields: [
                {
                    label: __("Date & Location"),
                    fieldtype: "Section Break" 
                },
                {
                    label: __("Sortir Date"),
                    fieldname: "sortir_date",
                    fieldtype: "Date",
                },     
                {
                    label: __("Location/Area"),
                    fieldname: "location_area",
                    fieldtype: "Link",
                    options: "Warehouse Location",
                },  
                {
                    fieldtype: "Column Break"
                },
                {
                    label: __("Supplier Code"),
                    fieldname: "supplier_code",
                    fieldtype: "Data",
                },       
                
                {
                    label: __("Supplier Name"),
                    fieldname: "supplier_name",
                    fieldtype: "Data",
                },
                {
                    fieldtype: "Column Break"
                },
                {
                    label: __("Part"),
                    fieldname: "part_in_sortir",
                    fieldtype: "Link",
                    options: "Part Master",
                },   
                {
                    label: __("Description"),
                    fieldname: "description",
                    fieldtype: "Small Text",
                },                 
                {
                    label: __("UM"),
                    fieldname: "um",
                    fieldtype: "Data",
                },     
                {
                    label: __("Qty"),
                    fieldtype: "Section Break" 
                },
                {
                    label: __("Total Qty To Sort"),
                    fieldname: "qty_to_Sort",
                    fieldtype: "Float",
                },     
                {
                    fieldtype: "Column Break"
                },
                {
                    label: __("Qty Reject/Return"),
                    fieldname: "qty_to_reject",
                    fieldtype: "Float",
                }, 
                {
                    fieldtype: "Column Break"
                },
                {
                    label: __("Qty Good/OK"),
                    fieldname: "qty_good",
                    fieldtype: "Float",
                },    
            ],
            size: 'extra-large',
            primary_action_label: __("Save"),
            primary_action(values) {
            }
            
	      });
	      sortir.show();
	      
		});
		frm.add_custom_button(__('Return To Supplier Confirmation'), function() {
		    const tosupplier = new frappe.ui.Dialog({
                title: __("Confirmation Lists"),
                fields: [
                    {
                        label: __("Purpose"),
                        fieldname: "purpose",
                        fieldtype: "Select",
                        options: ['Return all to supplier', 'Return with sorting to supplier'],
                        default: 'Return all to supplier', 
                    },   
                    {
                        fieldtype: "Section Break" 
                    },
                    {
                        label: __("Supplier Code"),
                        fieldname: "supplier_code",
                        fieldtype: "Data",
                    },       
                    {
                        fieldtype: "Column Break"
                    },
                    
                    {
                        label: __("Supplier Name"),
                        fieldname: "supplier_name",
                        fieldtype: "Data",
                    },

    
                    {
                        fieldtype: "Section Break" 
                    },
                    {
                    label: __("Total Qty To return"),
                    fieldname: "qty_to_Sort",
                    fieldtype: "Float",
                    },
                    {
                        fieldtype: "Column Break"
                    },
                    {
                        label: __("Total Qty selected"),
                        fieldname: "qty_selected",
                        fieldtype: "Float",
                    },
                    {
                        fieldtype: "Section Break" 
                    },
                    {   
                        label: "Please select the items from the list below to confirm the materials you wish to return to the supplier.",
                        fieldname: "data_lists",
                        fieldtype: "Table",
                        in_place_edit: true, 
                        reqd: 1,
                        data: [],
                        fields: [
                            { 
                                fieldname: "no", 
                                label: "No.", 
                                fieldtype: "Int", 
                                in_list_view: 1, 
                                columns: 1,
                                read_only: 1
                            },
                            { 
                                fieldname: "part", 
                                label: "Part", 
                                fieldtype: "Data",
                                in_list_view: 1, 
                                reqd: 1, 
                                columns: 1,
                            },
                            { 
                                fieldname: "description", 
                                label: "Desc", 
                                fieldtype: "Link", 
                                options: "Part Master",
                                in_list_view: 1,  
                                reqd: 1, 
                                columns: 2
                            },
                            
                              { 
                                fieldname: "um", 
                                label: "UM", 
                                fieldtype: "Data", 
                                in_list_view: 1,  
                                reqd: 0, 
                                columns: 1
                            },
                            { 
                                fieldname: "lotserial", 
                                label: "Lot Serial", 
                                fieldtype: "Data", 
                                in_list_view: 1,  
                                reqd: 0, 
                                columns: 2 
                            },
                            { 
                                fieldname: "location", 
                                label: "Location", 
                                fieldtype: "Data", 
                                in_list_view: 1,  
                                reqd: 1, 
                                columns: 2
                            },
                            { 
                                fieldname: "qty", 
                                label: "Qty", 
                                fieldtype: "Float", 
                                in_list_view: 1, 
                                reqd: 1, 
                                columns: 1
                            }
                        ],
                        on_add_row: (idx) => {
                            let data_id = idx - 1;
                            let material_label = dialog.fields_dict.xx_material_incoming_item;
                            material_label.df.data[data_id].no = idx;
                            material_label.grid.refresh();
                        },
                        label_remove: function(frm) {
                            msgprint("Row deleted");
                        },
                        remove_rows_button: (idx) => {
                            msgprint(`Row deleted: ${idx}`);
                        }
                    }
                ],
        
                size: 'large',
                primary_action_label: __("Save Changes"),
                primary_action(values) {
                }
		    });
		    let grid = tosupplier.get_field('data_lists').grid;
		    grid.cannot_add_rows = true;      // Menghilangkan tombol "Add Row"
            grid.cannot_delete_rows = true;   // Menghilangkan ikon sampah (delete)
            grid.wrapper.find('.grid-remove-rows').hide(); // Sembunyikan tombol delete massal
            grid.wrapper.find('.grid-add-row').hide();    // Sembunyikan tombol add row di bawah
		    tosupplier.show();
		});
    }
});
