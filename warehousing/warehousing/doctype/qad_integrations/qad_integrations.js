// Copyright (c) 2026, lukubara and contributors
// For license information, please see license.txt

frappe.ui.form.on("Qad Integrations", {
  wsa_url: function(frm) {
    if (frm.doc.wsa_url === 'qad_api_dev_url') {
      frm.set_value("url", "http://127.0.0.1:23079/wsa/smiiwsa");
    }
    else if (frm.doc.wsa_url === 'qad_api_test_url') {
      frm.set_value("url", "http://127.0.0.1:24079/wsa/smiiwsa");
    }
    else if (frm.doc.wsa_url === 'qad_api_prod_url') {
      frm.set_value("url", "http://127.0.0.1:25079/wsa/smiiwsa");
    }
    else {
      frm.set_value("url", "http://127.0.0.1:24079/wsa/smiiwsa");
    }
  },

});
