// Daftarkan ke objek global 'frappe' agar tidak bentrok dan rapi
frappe.utils.custom_format_number = function(nilai) {
    let angka_terformat = format_number(flt(nilai), null, 3);
    return angka_terformat.replace(/([.,][0-9]*[1-9])0+$|[.,]0+$/, '$1');
};