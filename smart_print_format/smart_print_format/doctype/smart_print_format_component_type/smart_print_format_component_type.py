# Copyright (c) 2026, Dhanaa Lakshmi and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SmartPrintFormatComponentType(Document):
    def validate(self):
        self.validate_name()

    def validate_name(self):
        if self.type_name.strip() != self.type_name:
            frappe.throw("Type Name cannot start or end with spaces.")
