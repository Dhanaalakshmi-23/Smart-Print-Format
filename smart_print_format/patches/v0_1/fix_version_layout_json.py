import json

import frappe


def execute():
	"""Smart Print Format Version.layout_json changes from Long Text to JSON."""
	if not frappe.db.table_exists("Smart Print Format Version"):
		return

	for name, value in frappe.get_all(
		"Smart Print Format Version", fields=["name", "layout_json"], as_list=True
	):
		try:
			json.loads(value or "")
		except TypeError, ValueError:
			frappe.db.set_value(
				"Smart Print Format Version",
				name,
				"layout_json",
				json.dumps({"sections": []}),
				update_modified=False,
			)
