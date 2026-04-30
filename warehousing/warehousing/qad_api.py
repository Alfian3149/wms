#from suds.client import Client
#from suds.client import Client
import frappe
import requests

API_CONNECTION_USED = 'http://smii.qad:24079/wsa/smiiwsa/wsdl?targetURI=urn:services-qad-com:smiiwsa:0001'
def getProductStructure(ipdomain, ipparent1, ipparent2):
    client = Client(API_CONNECTION_USED)
    response = client.service.zzpsrp(
        domain = ipdomain,
        parent1 = ipparent1,
        parent2 = ipparent2,
    )
    return response 

@frappe.whitelist()
def callTestApi():
    testApi = getProductStructure("smii", "ISC402", "ISC402")
    return testApi

@frappe.whitelist()
def externalApiTest():
    external_api_endpoint = "https://dummyjson.com/products" 
    response = frappe.make_get_request(external_api_endpoint)

    # Process the response (e.g., convert to JSON if the API returns JSON)
    if response.status_code == 200:
        data = response.json()
        return f"Data received: {data}"
    else:
        return f"Error fetching data: {response.status_code} - {response.text}"
    

@frappe.whitelist()
def fetch_external_data():
    api_url = "https://dummyjson.com/products"  # Replace with your API endpoint
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer YOUR_API_KEY"  # If authentication is required
    }
    params = {
        "param1": "value1",
        "param2": "value2"
    }

    try:
        response = requests.get(api_url)
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
        data = response.json()  # Parse JSON response
        return data
    except requests.exceptions.RequestException as e:
        frappe.log_error(f"Error fetching data from external API: {e}", "External API Error")
        frappe.throw(f"Failed to fetch data: {e}")
    
@frappe.whitelist()
def soapRequest():
    import requests
    import json
    from bs4 import BeautifulSoup 

    url = "http://smii.qad:24079/wsa/smiiwsa"

    payload = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\">\n  <soap:Body>\n    <zzpsrp xmlns=\"urn:services-qad-com:smiiwsa:0001:smiiwsa\">\n      <domain>SMII</domain>\n      <parent1>ISC402</parent1>\n      <parent2>ISC402</parent2>\n    </zzpsrp>\n  </soap:Body>\n</soap:Envelope>\n"
    headers = {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '""'
    } 
    #response = frappe.make_post_request(url, headers=headers, data=payload)
    response = requests.request("POST", url, headers=headers, data=payload)
    soup = BeautifulSoup(response.text, 'xml')
    dataset_tag = soup.find('oplcdataset')
    json_string = dataset_tag.text.strip()
    data_dict = json.loads(json_string)
    material_data = data_dict.get("xxtt_material")
    return material_data

@frappe.whitelist()
def test_soap():
    import requests

    url = "http://smii.qad:24079/wsa/smiiwsa"

    payload = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\">\n  <soap:Body>\n    <xxitemmstr xmlns=\"urn:services-qad-com:smiiwsa:0001:smiiwsa\">\n      <ip_domain>SMII</ip_domain>\n      <ip_site>1000</ip_site>\n    </xxitemmstr>\n  </soap:Body>\n</soap:Envelope>\n"
    headers = {
    'Content-Type': 'text/xml; charset=utf-8',
    'SOAPAction': '""'
    }

    response = requests.request("POST", url, headers=headers, data=payload)

    return response.text

@frappe.whitelist()
def call_django_local_api():
    response = requests.get('http://127.0.0.1:7000/api/buku/?format=json')
    data = response.json()  # Parse JSON response
    return data

@frappe.whitelist()
def call_smii_rest_api_test():
    response = requests.get('http://simcost.sinarmeadow.com:8000/standardcost/rest-api-test')
    data = response.json()  # Parse JSON response
    return data
@frappe.whitelist()
def test_frappe_request():
    return "test"