frappe.treeview_settings['Warehouse'] = {
	get_tree_nodes: 'warehousing.warehousing.doctype.warehouse_location.get_children',
	add_tree_node: 'warehousing.warehousing.doctype.warehouse_location.add_node',
	filters: [
		{
			fieldname: "site",
			label: __("Company"),
			fieldtype: "Link",
			options: "1000",
			default: "1000"
		}
	],
	breadcrumb: "Stock",
	get_tree_root: false,
	root_label: "All Warehouses",
    ignore_fields: ["parent_warehouse_location"],
}	