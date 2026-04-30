import json
import requests
import frappe
from frappe import _
from bs4 import BeautifulSoup 

@frappe.whitelist()
def get_po_from_qad(): 
    # 1. Ambil domain aktif (biasanya disimpan di System Settings atau konstanta)
    qad_domain = "SMII" 

    # 2. Susun Payload JSON sesuai struktur Dataset dsPOInput
    input_data = {
        "dsPOInput": {
            "ttPORequest": [
                {
                    "domain_filter": qad_domain,
                    "ponbr_filter": "102339"
                }
            ]
        }
    }
     
    # Ubah dictionary ke JSON string
    json_string = json.dumps(input_data)

    url = "http://smii.qad:24079/wsa/smiiwsa"

    payload = f"""<?xml version=\"1.0\" encoding=\"utf-8\"?>\n
        <soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\">\n
        <soap:Body>\n
        <zzpsrp xmlns=\"urn:services-qad-com:smiiwsa:0001:smiiwsa\">\n
        <domain>SMII</domain>\n
        <parent1>ISC402</parent1>\n
        <parent2>ISC402</parent2>\n
        </zzpsrp>\n
        </soap:Body>\n
        </soap:Envelope>\n"""
    headers = {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '""'
    }

    url = "http://smii.qad:24079/wsa/smiiwsa"

    payload = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\">\n  <soap:Body>\n    <zzpsrp xmlns=\"urn:services-qad-com:smiiwsa:0001:smiiwsa\">\n      <domain>SMII</domain>\n      <parent1>ISC402</parent1>\n      <parent2>ISC402</parent2>\n    </zzpsrp>\n  </soap:Body>\n</soap:Envelope>\n"
    headers = {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '""'
    }

    try:
        # Kirim request
        response = requests.request("POST", url, headers=headers, data=payload)
        
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'xml')
            dataset_tag = soup.find('oplcdataset')
            json_string = dataset_tag.text.strip()
            data_dict = json.loads(json_string)
            material_data = data_dict.get("xxtt_material")
            return material_data

            return parse_qad_response(response.text)
        else:
            frappe.throw(_("Koneksi ke QAD Gagal: {0}").format(response.status_code))

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "QAD Get PO API Error")
        frappe.throw(_("Terjadi kesalahan saat menghubungi QAD: {0}").format(str(e)))

def parse_qad_response(xml_response):
    # Logika sederhana untuk mengambil isi di dalam tag opDatasetResult
    # Anda bisa menggunakan library xml.etree.ElementTree untuk parsing yang lebih rapi
    import xml.etree.ElementTree as ET
    
    try:
        root = ET.fromstring(xml_response)
        # Mencari tag yang berisi JSON output (sesuaikan nama tag-nya)
        # Biasanya WSA membungkus output di dalam Response -> result
        for result in root.iter():
            if 'opDatasetResult' in result.tag:
                return json.loads(result.text)
    except Exception:
        frappe.throw(_("Gagal membaca respon JSON dari QAD"))