# Copyright (c) 2026, lukubara and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PutawayMethod(Document):
	pass


@frappe.whitelist()
def get_multi_bin_suggestion(item_code, qty):
    qty_to_allocate = float(qty)
    suggestions = []
    
    # 1. Ambil daftar Bin/Warehouse yang tersedia (Urutkan dari Priority & Kapasitas terbesar)
    # Kita asumsikan Warehouse level terbawah (Bin) memiliki field 'capacity'
    bins = frappe.get_all("Putaway Method", 
        fields=["warehouse_location", "heavy_capacity", "pallet_capacity", "priority"],
        filters={
            "is_group": 0, 
            "disabled": 0,
            "warehouse_location": ["in", frappe.get_all("Warehouse Location", {"disabled": 0}, "warehouse_name")]
        },
        order_by="priority asc, pallet_capacity desc"
    )

    for b in bins:
        if qty_to_allocate <= 0:
            break

        # 2. Hitung sisa kapasitas di Bin ini
        # Mengambil total semua item yang ada di Bin tersebut saat ini
        total_occupied = frappe.db.get_value("Bin", 
            {"warehouse": b.name}, 
            "sum(actual_qty)") or 0
        
        remaining_capacity = float(b.capacity) - float(total_occupied)

        # 3. Jika Bin memiliki ruang (lebih dari 0)
        if remaining_capacity > 0:
            # Tentukan berapa yang bisa masuk ke Bin ini
            allocated_qty = min(qty_to_allocate, remaining_capacity)
            
            suggestions.append({
                "bin": b.name,
                "qty": allocated_qty,
                "priority": b.priority,
                "message": "Full match" if allocated_qty == qty_to_allocate else "Partial match"
            })
            
            qty_to_allocate -= allocated_qty

    # 4. Validasi Akhir
    if qty_to_allocate > 0:
        return {
            "status": "partial",
            "suggestions": suggestions,
            "remaining_unallocated": qty_to_allocate,
            "error": "Gudang penuh, sebagian barang tidak mendapat Bin."
        }

    return {
        "status": "success",
        "suggestions": suggestions
    }