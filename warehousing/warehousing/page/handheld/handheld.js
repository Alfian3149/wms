frappe.pages['handheld'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'WMS Handheld',
        single_column: true
    });

// 1. Bersihkan UI standar Frappe agar fokus ke Aplikasi Handheld
    $('.navbar').hide(); 
    $(wrapper).find('.page-head').hide();
    $(wrapper).find('.layout-main-section-wrapper').css('padding-top', '0px');
    $(wrapper).find('.layout-main-section').css('padding', '0px');

    // 2. Buat container utama untuk React
    let $container = $('<div id="root"></div>').appendTo($(wrapper).find('.layout-main-section'));

    // 3. Konfigurasi Path
    // Cek apakah kita sedang di localhost (Development)
    const is_dev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // Alamat Vite Dev Server (Sesuaikan port jika berbeda)
    const vite_server = 'http://localhost:5173';
    const base_asset_path = '/assets/warehousing/flexinventory/dist/';

    if (is_dev) {
        console.log("WMS Handheld: Running in Development Mode (Vite)");
        
        // Load CSS dari Vite
        // Catatan: Di Vite Dev Mode, CSS seringkali di-inject via JS, 
        // tapi kita panggil manual untuk memastikan style masuk ke wrapper Frappe.
        $('<link>')
            .appendTo('head')
            .attr({ type: 'text/css', rel: 'stylesheet' })
            .attr('href', vite_server + base_asset_path + 'index.css');

        // Load JS dari Vite
        frappe.require(vite_server + base_asset_path + 'index.js');
        
    } else {
        console.log("WMS Handheld: Running in Production Mode");
        
        // Load Aset Lokal (Hasil build terakhir)
        frappe.require(base_asset_path + "index.css");
        frappe.require(base_asset_path + "index.js");
    }
}