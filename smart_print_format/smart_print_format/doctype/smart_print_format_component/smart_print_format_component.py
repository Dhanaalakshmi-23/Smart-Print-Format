# Copyright (c) 2026, Dhanaa Lakshmi and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SmartPrintFormatComponent(Document):
    def validate(self):
        self.validate_name()
        self.validate_component_type()
        self.validate_configuration()

    def validate_name(self):
        if self.component_name.strip() != self.component_name:
            frappe.throw("Component Name cannot start or end with spaces.")

    def validate_component_type(self):
        if not self.component_type:
            return

        if not frappe.db.exists(
            "Smart Print Format Component Type",
            {
                "name": self.component_type,
                "is_active": 1,
            },
        ):
            frappe.throw(
                f"Component Type '{self.component_type}' is not active."
            )

    def validate_configuration(self):
        if not self.configuration_json:
            return

        try:
            configuration = frappe.parse_json(self.configuration_json)
        except Exception:
            frappe.throw("Configuration JSON is invalid.")

        if not isinstance(configuration, dict):
            frappe.throw("Configuration JSON must be a JSON object.")