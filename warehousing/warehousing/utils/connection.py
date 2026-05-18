import requests
import frappe
from frappe import _
def test_internal_api(url):
    try:
        response = requests.get(url, timeout=2)
        if response.status_code == 200:
            return {"status": "success", "message": "Koneksi server internal berhasil"}
    except requests.exceptions.ConnectionError:
        frappe.throw(_("Gagal terhubung ke server internal. Pastikan server internal berjalan dan dapat diakses."))
    except requests.exceptions.Timeout:
        frappe.throw(_("Koneksi ke server internal timeout. Pastikan server internal merespon dalam waktu yang wajar."))
    except Exception as e:
        frappe.throw(_("Terjadi kesalahan saat menghubungi server internal: {0}").format(str(e)))   

def get_url():
    wsa_url = frappe.db.get_single_value("Qad Integrations", "wsa_url")
    return frappe.conf.get(wsa_url) or "http://127.0.0.1:24079/wsa/smiiwsa"