frappe.pages['warehouse-monitoring'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Warehouse Bins',
		single_column: true
	});
	// Create container
    $(wrapper).find('.layout-main-section').empty().append(`
        <div id="warehouse-dashboard" class="p-4">
            <div class="row mb-4" id="stats-cards"></div>
            
            <div class="card p-3">
                <div class="d-flex justify-content-between mb-3">
                    <input type="text" id="search-wh" class="form-control w-50" placeholder="Search bin location...">
                    <div class="btn-group">
                        <button class="btn btn-primary">Table</button>
                        <button class="btn btn-light">Grid</button>
                    </div>
                </div>
                <div id="warehouse-table-container"></div>
            </div>
        </div>
    `);

    render_data(wrapper);
}

function render_data(wrapper) {
    frappe.call({
        method: "path.to.your.script.get_warehouse_stats", // Sesuaikan path-nya
        callback: function(r) {
            let data = r.message;
            
            // Render Cards (Summary)
            let total = data.length;
            let available = data.filter(d => d.current_stock == 0).length;
            
            $('#stats-cards').html(`
                <div class="col-md-3">
                    <div class="card p-3 text-center"><h6>Total Bins</h6><h3>${total}</h3></div>
                </div>
                <div class="col-md-3">
                    <div class="card p-3 text-center" style="border-left: 5px solid green"><h6>Available</h6><h3>${available}</h3></div>
                </div>
                `);

            // Render Table
            let table_html = `
                <table class="table border-0">
                    <thead class="text-muted">
                        <tr>
                            <th>LOCATION</th><th>ZONE</th><th>STATUS</th><th>CAPACITY</th><th>CURRENT STOCK</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(d => `
                            <tr>
                                <td class="font-weight-bold">${d.location}</td>
                                <td><span class="badge badge-blue">${d.zone || 'N/A'}</span></td>
                                <td><span class="badge badge-green">Available</span></td>
                                <td>${d.capacity} units</td>
                                <td>
                                    <div class="progress" style="height: 10px;">
                                        <div class="progress-bar bg-success" style="width: ${(d.current_stock/d.capacity)*100}%"></div>
                                    </div>
                                    <small>${d.current_stock} / ${d.capacity}</small>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            $('#warehouse-table-container').html(table_html);
        }
    });
}