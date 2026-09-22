# Copyright (c) 2026, Dhanaa Lakshmi and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SmartPrintFormatVersion(Document):

    def before_insert(self):
        self.created_by = frappe.session.user
        self.created_on = frappe.utils.now_datetime()

    def validate(self):
        if not self.is_new():
            self.validate_immutable()

        self.validate_version_number()
        self.validate_version_sequence()
        self.validate_layout_json()
        self.validate_published_version()

    def validate_immutable(self):
        previous = frappe.db.get_value(
            "Smart Print Format Version",
            self.name,
            ["layout_json", "generated_html", "generated_css"],
            as_dict=True,
        )

        if not previous:
            return

        if (
            self.layout_json != previous.layout_json
            or self.generated_html != previous.generated_html
            or self.generated_css != previous.generated_css
        ):
            frappe.throw(
                "A saved Smart Print Format Version is immutable. "
                "Create a new version instead of editing this one."
            )

    def validate_version_number(self):
        if self.version_number < 1:
            frappe.throw("Version Number must be greater than 0.")

    def validate_version_sequence(self):
        existing = frappe.db.exists(
            "Smart Print Format Version",
            {
                "smart_print_format": self.smart_print_format,
                "version_number": self.version_number,
                "name": ["!=", self.name],
            },
        )

        if existing:
            frappe.throw(
                f"Version {self.version_number} already exists for "
                f"Smart Print Format '{self.smart_print_format}'."
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

    def validate_published_version(self):
        if not self.is_published:
            return

        existing = frappe.db.exists(
            "Smart Print Format Version",
            {
                "smart_print_format": self.smart_print_format,
                "is_published": 1,
                "name": ["!=", self.name],
            },
        )

        if existing:
            frappe.throw(
                "Another published version already exists for this "
                "Smart Print Format."
            )
