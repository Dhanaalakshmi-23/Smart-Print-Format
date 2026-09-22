# Copyright (c) 2026, Dhanaa Lakshmi and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SmartPrintFormat(Document):
    def validate(self):
        self.validate_status()
        self.validate_version()
        self.validate_active_format()
        self.validate_print_format()
        self.validate_layout_json()

    def validate_status(self):
        if self.status == "Archived" and self.is_active:
            frappe.throw("Archived Smart Print Formats cannot be active.")

    def validate_version(self):
        if self.version < 1:
            frappe.throw("Version must be greater than 0.")

    def validate_active_format(self):
        if not self.is_active:
            return

        existing = frappe.db.exists(
            "Smart Print Format",
            {
                "target_doctype": self.target_doctype,
                "print_format": self.print_format,
                "is_active": 1,
                "name": ["!=", self.name],
            },
        )

        if existing:
            frappe.throw(
                "Another active Smart Print Format already exists for this "
                "DocType and Print Format."
            )

    def validate_print_format(self):
        if not self.print_format:
            return

        print_format_doctype = frappe.db.get_value(
            "Print Format",
            self.print_format,
            "doc_type",
        )

        if print_format_doctype != self.target_doctype:
            frappe.throw(
                f"Print Format '{self.print_format}' belongs to "
                f"'{print_format_doctype}', not '{self.target_doctype}'."
            )

    def validate_layout_json(self):
        if not self.layout_json:
            return

        try:
            layout = frappe.parse_json(self.layout_json)
        except Exception:
            frappe.throw("Layout JSON is invalid.")

        if not isinstance(layout, dict):
            frappe.throw("Layout JSON must contain a JSON object.")

        if "sections" not in layout:
            frappe.throw("Layout JSON must contain a 'sections' property.")

        if not isinstance(layout["sections"], list):
            frappe.throw("Layout JSON 'sections' must be a list.")
