import copy
import json
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from smart_print_format import api
from smart_print_format.html_generator import generate
from smart_print_format.validators import check_condition, validate_layout

# ---- Fixtures ----

INVOICE = "SPF Test Invoice"
INVOICE_ITEM = "SPF Test Invoice Item"
MANAGER = "spf-manager@example.com"
NO_ACCESS = "spf-no-access@example.com"


def ensure_test_doctypes():
	if not frappe.db.exists("DocType", INVOICE_ITEM):
		frappe.get_doc(
			{
				"doctype": "DocType",
				"name": INVOICE_ITEM,
				"module": "Smart Print Format",
				"custom": 1,
				"istable": 1,
				"fields": [
					{"fieldname": "item_name", "label": "Item", "fieldtype": "Data", "in_list_view": 1},
					{"fieldname": "qty", "label": "Qty", "fieldtype": "Float", "in_list_view": 1},
					{"fieldname": "rate", "label": "Rate", "fieldtype": "Currency", "in_list_view": 1},
					{"fieldname": "amount", "label": "Amount", "fieldtype": "Currency", "in_list_view": 1},
					{"fieldname": "internal_note", "label": "Internal Note", "fieldtype": "Data"},
				],
			}
		).insert()

	if not frappe.db.exists("DocType", INVOICE):
		frappe.get_doc(
			{
				"doctype": "DocType",
				"name": INVOICE,
				"module": "Smart Print Format",
				"custom": 1,
				"autoname": "hash",
				"fields": [
					{"fieldname": "customer", "label": "Customer", "fieldtype": "Data"},
					{"fieldname": "posting_date", "label": "Posting Date", "fieldtype": "Date"},
					{"fieldname": "is_return", "label": "Is Return", "fieldtype": "Check"},
					{"fieldname": "notes", "label": "Notes", "fieldtype": "Small Text"},
					{"fieldname": "details_section", "label": "Details", "fieldtype": "Section Break"},
					{"fieldname": "items", "label": "Items", "fieldtype": "Table", "options": INVOICE_ITEM},
					{"fieldname": "grand_total", "label": "Grand Total", "fieldtype": "Currency"},
				],
				"permissions": [
					{"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "print": 1},
					{"role": "Smart Print Manager", "read": 1, "print": 1},
				],
			}
		).insert()


def drop_test_doctypes():
	"""Delete the test DocTypes and everything built on them, so nothing stays in the site."""
	for spf in frappe.get_all("Smart Print Format", {"target_doctype": INVOICE}, pluck="name"):
		frappe.db.delete("Smart Print Format Version", {"smart_print_format": spf})
		frappe.delete_doc("Smart Print Format", spf, force=True, ignore_permissions=True)
	for print_format in frappe.get_all("Print Format", {"doc_type": INVOICE}, pluck="name"):
		frappe.delete_doc("Print Format", print_format, force=True, ignore_permissions=True)
	for doctype in (INVOICE, INVOICE_ITEM):
		if frappe.db.exists("DocType", doctype):
			frappe.delete_doc("DocType", doctype, force=True, ignore_permissions=True)
		# Deleting a DocType keeps its table.
		frappe.db.sql_ddl(f"drop table if exists `tab{doctype}`")
	frappe.db.commit()


def ensure_user(email, roles):
	if frappe.db.exists("User", email):
		user = frappe.get_doc("User", email)
	else:
		user = frappe.get_doc(
			{"doctype": "User", "email": email, "first_name": email.split("@")[0], "send_welcome_email": 0}
		).insert(ignore_permissions=True)
	user.set("roles", [])
	user.add_roles(*roles)
	return email


def make_invoice(**values):
	doc = frappe.get_doc(
		{
			"doctype": INVOICE,
			"customer": "Acme <Corp>",
			"posting_date": "2026-09-01",
			"notes": "Line one\nLine two",
			"items": [
				{"item_name": "Widget", "qty": 2, "rate": 50, "amount": 100},
				{"item_name": "Gadget", "qty": 1, "rate": 25.5, "amount": 25.5},
			],
			"grand_total": 125.5,
			**values,
		}
	)
	doc.insert()
	return doc


INVOICE_LAYOUT = {
	"sections": [
		{
			"id": "header",
			"type": "section",
			"kind": "header",
			"label": "",
			"props": {},
			"columns": [
				{
					"id": "header_left",
					"type": "column",
					"props": {"width": 40},
					"fields": [{"id": "logo", "type": "component", "component": "Company Logo", "props": {}}],
				},
				{
					"id": "header_right",
					"type": "column",
					"props": {},
					"fields": [
						{
							"id": "title_text",
							"type": "component",
							"component": "Text",
							"configuration": {"text": "SALES INVOICE"},
							"props": {"align": "right", "fontSize": 18, "bold": True},
						},
						{
							"id": "doc_name",
							"type": "field",
							"fieldname": "name",
							"props": {"hideLabel": True},
						},
					],
				},
			],
		},
		{
			"id": "info",
			"type": "section",
			"label": "",
			"props": {},
			"columns": [
				{
					"id": "info_left",
					"type": "column",
					"props": {},
					"fields": [
						{
							"id": "customer",
							"type": "field",
							"fieldname": "customer",
							"label": "Customer",
							"fieldtype": "Data",
							"options": "",
							"props": {"bold": True, "color": "#1f2328", "condition": "doc.customer != ''"},
						},
						{"id": "notes", "type": "field", "fieldname": "notes", "props": {}},
					],
				},
				{
					"id": "info_right",
					"type": "column",
					"props": {},
					"fields": [
						{"id": "posting_date", "type": "field", "fieldname": "posting_date", "props": {}},
						{"id": "is_return", "type": "field", "fieldname": "is_return", "props": {}},
					],
				},
			],
		},
		{
			"id": "items_section",
			"type": "section",
			"label": "",
			"props": {},
			"columns": [
				{
					"id": "items_col",
					"type": "column",
					"props": {},
					"fields": [
						{
							"id": "items",
							"type": "field",
							"fieldname": "items",
							"label": "Items",
							"fieldtype": "Table",
							"options": INVOICE_ITEM,
							"props": {},
						},
						{
							"id": "grand_total",
							"type": "field",
							"fieldname": "grand_total",
							"props": {"label": "Total"},
						},
					],
				}
			],
		},
		{
			"id": "footer",
			"type": "section",
			"kind": "footer",
			"label": "",
			"props": {},
			"columns": [
				{
					"id": "footer_col",
					"type": "column",
					"props": {},
					"fields": [
						{"id": "page_no", "type": "component", "component": "Page Number", "props": {}}
					],
				}
			],
		},
	]
}


def invoice_layout():
	return copy.deepcopy(INVOICE_LAYOUT)


def find_node(layout, node_id):
	for section in layout["sections"]:
		if section["id"] == node_id:
			return section
		for column in section["columns"]:
			if column["id"] == node_id:
				return column
			for node in column["fields"]:
				if node["id"] == node_id:
					return node
	return None


class TestSmartPrintFormat(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		ensure_test_doctypes()
		ensure_user(MANAGER, ["Smart Print Manager"])
		ensure_user(NO_ACCESS, [])

	@classmethod
	def tearDownClass(cls):
		frappe.set_user("Administrator")
		drop_test_doctypes()
		super().tearDownClass()

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()

	def create_format(self, title="Test Invoice Print", layout=None):
		return api.create_smart_print_format(
			title=title, target_doctype=INVOICE, layout_json=json.dumps(layout or invoice_layout())
		)

	def test_create_without_title_uses_default(self):
		doc = api.create_smart_print_format(target_doctype=INVOICE, layout_json=json.dumps(invoice_layout()))
		self.assertEqual(doc["title"], f"{INVOICE} Format")

	def test_metadata_permission_denied(self):
		frappe.set_user(NO_ACCESS)
		with self.assertRaises(frappe.PermissionError):
			api.get_doctype_metadata(INVOICE)

	def test_metadata_returns_fields_and_child_tables(self):
		frappe.set_user(MANAGER)
		result = api.get_doctype_metadata(INVOICE)
		fieldnames = [f["fieldname"] for f in result["meta"]["fields"]]
		self.assertIn("customer", fieldnames)
		self.assertIn(INVOICE_ITEM, result["childTables"])

	def test_validation_requires_read_on_target_doctype(self):
		frappe.set_user(NO_ACCESS)
		result = validate_layout(INVOICE, invoice_layout())
		self.assertFalse(result["valid"])
		self.assertIn("permission", result["errors"][0]["message"])

	def test_non_privileged_user_cannot_publish(self):
		name = self.create_format()["name"]
		frappe.set_user(NO_ACCESS)
		with self.assertRaises(frappe.PermissionError):
			api.publish_print_format(name)
		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Smart Print Format", name, "status"), "Draft")

	def test_smart_print_manager_can_publish(self):
		frappe.set_user(MANAGER)
		doc = api.create_smart_print_format(
			title="Manager Invoice", target_doctype=INVOICE, layout_json=json.dumps(invoice_layout())
		)
		published = api.publish_print_format(doc["name"])
		self.assertEqual(published["status"], "Active")

	def test_unknown_fieldname_rejected(self):
		layout = invoice_layout()
		find_node(layout, "customer")["fieldname"] = "no_such_field"
		result = validate_layout(INVOICE, layout)
		self.assertFalse(result["valid"])
		self.assertEqual(result["errors"][0]["node_id"], "customer")
		self.assertIn("no_such_field", result["errors"][0]["message"])

		with self.assertRaises(api.LayoutValidationError):
			self.create_format(layout=layout)

	def test_all_errors_are_collected(self):
		layout = invoice_layout()
		find_node(layout, "customer")["fieldname"] = "no_such_field"
		find_node(layout, "notes")["props"]["fontSize"] = 200
		find_node(layout, "posting_date")["props"]["align"] = "justify"
		find_node(layout, "items")["table"] = {"columns": [{"fieldname": "missing_column"}]}
		result = validate_layout(INVOICE, layout)
		node_ids = {error["node_id"] for error in result["errors"]}
		self.assertEqual(node_ids, {"customer", "notes", "posting_date", "items"})

	def test_bad_color_and_width_rejected(self):
		for color in ("#12345", "rgb(0,0,0)", "red;background:url(x)"):
			layout = invoice_layout()
			find_node(layout, "customer")["props"]["color"] = color
			result = validate_layout(INVOICE, layout)
			self.assertFalse(result["valid"], color)
			self.assertEqual(result["errors"][0]["node_id"], "customer")

		layout = invoice_layout()
		find_node(layout, "customer")["props"].update({"color": "#1f2328", "width": 0})
		result = validate_layout(INVOICE, layout)
		self.assertEqual([e["node_id"] for e in result["errors"]], ["customer"])
		self.assertIn("width", result["errors"][0]["message"])

	def test_structure_errors(self):
		layout = invoice_layout()
		layout["sections"].reverse()
		find_node(layout, "notes")["id"] = "customer"
		messages = " ".join(e["message"] for e in validate_layout(INVOICE, layout)["errors"])
		self.assertIn("header section must be the first", messages)
		self.assertIn("footer section must be the last", messages)
		self.assertIn("Duplicate node id", messages)

	def test_unsafe_condition_rejected(self):
		for condition in (
			"doc.__class__",
			"frappe.db.sql('select 1')",
			"doc.customer.upper() == 'X'",
			"__import__('os')",
			"doc.items[doc.customer]",
			"doc.customer == '{{ 7*7 }}'",
		):
			jinja, error = check_condition(condition)
			self.assertIsNone(jinja, condition)
			self.assertTrue(error, condition)

		layout = invoice_layout()
		find_node(layout, "customer")["props"]["condition"] = "doc.__class__.__init__"
		result = validate_layout(INVOICE, layout)
		self.assertFalse(result["valid"])
		self.assertEqual(result["errors"][0]["node_id"], "customer")

	def test_safe_conditions_accepted(self):
		for condition, expected in (
			("eval:doc.customer != ''", "doc.customer != ''"),
			("doc.is_return and doc.grand_total > 100", "doc.is_return and doc.grand_total > 100"),
			("doc.customer in ('A', 'B')", "doc.customer in ('A', 'B')"),
			("not doc.is_return", "not doc.is_return"),
		):
			self.assertEqual(check_condition(condition), (expected, None))

	def test_inactive_component_rejected(self):
		layout = invoice_layout()
		find_node(layout, "logo")["component"] = "Does Not Exist"
		result = validate_layout(INVOICE, layout)
		self.assertIn("does not exist", result["errors"][0]["message"])

	def test_script_stripped_from_custom_html(self):
		layout = invoice_layout()
		find_node(layout, "info_left")["fields"].append(
			{
				"id": "custom_html",
				"type": "component",
				"component": "Custom HTML",
				"configuration": {
					"html": '<p onclick="steal()">Hi <a href="javascript:alert(1)">x</a></p>'
					"<script>alert(1)</script>{{ frappe.db.sql('select 1') }}"
				},
				"props": {},
			}
		)
		result = validate_layout(INVOICE, layout)
		self.assertTrue(result["valid"])
		self.assertTrue(any(w["node_id"] == "custom_html" for w in result["warnings"]))

		html = generate(INVOICE, layout)["html"]
		self.assertNotIn("<script", html)
		self.assertNotIn("onclick", html)
		self.assertNotIn("javascript:", html)
		self.assertNotIn("{{ frappe.db.sql", html)

		rendered = frappe.render_template(html, {"doc": make_invoice()})
		self.assertIn("Hi", rendered)
		self.assertNotIn("<script", rendered)

	def test_generated_template_renders(self):
		invoice = make_invoice()
		invoice.customer = "Acme <Corp>"
		result = generate(INVOICE, invoice_layout())
		html, css = result["html"], result["css"]

		self.assertTrue(html.startswith('<div class="spf-print">'))
		self.assertIn("{% for row in doc.items %}", html)
		self.assertIn('<div id="footer-html"', html)
		self.assertIn('<span class="page"></span>', html)
		self.assertNotIn("{{ page_no", html)
		self.assertNotIn("{{ pages", html)
		self.assertNotIn("style=", html)
		self.assertIn(".spf-n-customer", css)
		self.assertIn("{% if doc.customer != '' %}", html)

		rendered = frappe.render_template(html, {"doc": invoice})
		self.assertIn("SALES INVOICE", rendered)
		self.assertIn("Acme &lt;Corp&gt;", rendered)
		self.assertIn("Line one<br>Line two", rendered)
		self.assertIn("Widget", rendered)
		self.assertIn("Gadget", rendered)
		self.assertIn("<th>Item</th>", rendered)
		self.assertNotIn("Internal Note", rendered)
		self.assertIn("Total: ", rendered)
		self.assertIn(invoice.name, rendered)

		empty = frappe.render_template(html, {"doc": make_invoice(customer="")})
		self.assertNotIn("spf-n-customer", empty)

	def test_hidden_node_not_rendered_and_table_columns_configurable(self):
		layout = invoice_layout()
		find_node(layout, "notes")["props"]["hidden"] = True
		find_node(layout, "items")["table"] = {
			"columns": [
				{"fieldname": "item_name", "label": "Description", "width": 70},
				{"fieldname": "amount"},
			]
		}
		result = generate(INVOICE, layout)
		self.assertNotIn("spf-n-notes", result["html"])
		rendered = frappe.render_template(result["html"], {"doc": make_invoice()})
		self.assertIn("<th>Description</th>", rendered)
		self.assertNotIn("<th>Qty</th>", rendered)
		self.assertIn("width: 70%", result["css"])

	def test_user_text_cannot_inject_jinja(self):
		layout = invoice_layout()
		find_node(layout, "customer")["props"]["label"] = "{{ frappe.session.user }}"
		find_node(layout, "title_text")["configuration"]["text"] = "{% for x in range(3) %}X{% endfor %}"
		rendered = frappe.render_template(generate(INVOICE, layout)["html"], {"doc": make_invoice()})
		self.assertNotIn("Administrator", rendered)
		self.assertIn("&#123;{ frappe.session.user }}", rendered)
		self.assertNotIn("XXX", rendered)

	def test_save_creates_version(self):
		doc = self.create_format()
		self.assertEqual(len(api.get_versions(doc["name"])), 1)

		layout = invoice_layout()
		find_node(layout, "customer")["props"]["fontSize"] = 16
		saved = api.save_layout(doc["name"], json.dumps(layout), change_summary="Bigger customer")

		versions = api.get_versions(doc["name"])
		self.assertEqual(len(versions), 2)
		self.assertEqual(versions[0].version_number, 2)
		self.assertEqual(versions[0].change_summary, "Bigger customer")
		self.assertEqual(versions[0].is_published, 0)
		self.assertEqual(saved["version"], 2)
		self.assertIn("font-size: 16px", saved["generated_css"])

		api.save_layout(doc["name"], json.dumps(layout))
		self.assertEqual(len(api.get_versions(doc["name"])), 2)

	def test_save_rejects_invalid_layout(self):
		doc = self.create_format()
		layout = invoice_layout()
		find_node(layout, "customer")["props"]["condition"] = "doc.customer.delete()"
		with self.assertRaises(api.LayoutValidationError):
			api.save_layout(doc["name"], json.dumps(layout))
		self.assertEqual(len(api.get_versions(doc["name"])), 1)

	def test_publish_writes_print_format(self):
		doc = self.create_format(title="Published Invoice")
		published = api.publish_print_format(doc["name"], change_summary="Go live")

		self.assertEqual(published["status"], "Active")
		self.assertEqual(published["is_active"], 1)
		self.assertEqual(published["last_published_by"], "Administrator")
		self.assertTrue(published["last_published_on"])

		print_format = frappe.get_doc("Print Format", published["print_format"])
		self.assertEqual(print_format.doc_type, INVOICE)
		self.assertEqual(print_format.custom_format, 1)
		self.assertEqual(print_format.print_format_type, "Jinja")
		self.assertEqual(print_format.standard, "No")
		self.assertIn(f"Managed by Smart Print Format: {doc['name']}", print_format.html)
		self.assertIn(published["generated_html"], print_format.html)
		self.assertEqual(print_format.css, published["generated_css"])

		versions = api.get_versions(doc["name"])
		self.assertEqual([v.is_published for v in versions], [1])

		invoice = make_invoice()
		html = frappe.get_print(INVOICE, invoice.name, print_format=print_format.name)
		self.assertIn("Widget", html)
		self.assertIn("spf-print", html)

	def test_republish_moves_published_flag(self):
		doc = self.create_format(title="Republished Invoice")
		first = api.publish_print_format(doc["name"])
		layout = invoice_layout()
		find_node(layout, "notes")["props"]["hidden"] = True
		api.save_layout(doc["name"], json.dumps(layout))
		second = api.publish_print_format(doc["name"])

		self.assertEqual(first["print_format"], second["print_format"])
		published = {v.version_number: v.is_published for v in api.get_versions(doc["name"])}
		self.assertEqual(published, {2: 1, 1: 0})

	def test_publish_rolls_back_on_failure(self):
		doc = self.create_format(title="Rollback Invoice")
		with patch("smart_print_format.api.set_published", side_effect=RuntimeError("boom")):
			with self.assertRaises(RuntimeError):
				api.publish_print_format(doc["name"])

		self.assertFalse(frappe.db.exists("Print Format", "Rollback Invoice"))
		spf = frappe.get_doc("Smart Print Format", doc["name"])
		self.assertEqual(spf.status, "Draft")
		self.assertFalse(spf.print_format)
		self.assertEqual(len(api.get_versions(doc["name"])), 1)

	def test_publish_refuses_standard_print_format(self):
		frappe.get_doc(
			{
				"doctype": "Print Format",
				"name": "SPF Standard Test",
				"doc_type": INVOICE,
				"standard": "No",
				"custom_format": 1,
				"print_format_type": "Jinja",
				"html": "<p>standard</p>",
			}
		).insert()
		frappe.db.set_value("Print Format", "SPF Standard Test", "standard", "Yes")
		doc = self.create_format(title="Standard Clash")
		api.save_layout(doc["name"], json.dumps(invoice_layout()), print_format="SPF Standard Test")
		with self.assertRaises(frappe.ValidationError):
			api.publish_print_format(doc["name"])
		self.assertEqual(frappe.db.get_value("Print Format", "SPF Standard Test", "html"), "<p>standard</p>")

	def test_restore_creates_backup_version(self):
		doc = self.create_format()
		layout = invoice_layout()
		find_node(layout, "customer")["props"]["fontSize"] = 20
		api.save_layout(doc["name"], json.dumps(layout))

		restored = api.restore_version(doc["name"], 1)

		versions = api.get_versions(doc["name"])
		self.assertEqual([v.version_number for v in versions], [3, 2, 1])
		self.assertIn("Backup before restoring version 1", versions[0].change_summary)
		backup = frappe.get_doc("Smart Print Format Version", versions[0].name)
		self.assertEqual(find_node(json.loads(backup.layout_json), "customer")["props"]["fontSize"], 20)
		self.assertNotIn("fontSize", find_node(restored["layout_json"], "customer")["props"])
		self.assertEqual(restored["status"], "Draft")

	def test_preview_renders_real_document(self):
		doc = self.create_format()
		invoice = make_invoice()
		layout = invoice_layout()
		find_node(layout, "title_text")["configuration"]["text"] = "PREVIEW ONLY"
		result = api.preview_print(doc["name"], invoice.name, json.dumps(layout))
		self.assertIn("<style>", result["html"])
		self.assertIn("PREVIEW ONLY", result["html"])
		self.assertIn("Widget", result["html"])

		frappe.set_user(NO_ACCESS)
		with self.assertRaises(frappe.PermissionError):
			api.preview_print(doc["name"], invoice.name)

	def test_components_api(self):
		names = [c.name for c in api.get_components()]
		for name in ("Company Logo", "Divider", "Custom HTML", "Page Number", "Text", "Signature"):
			self.assertIn(name, names)
		text = api.get_components("Text")
		self.assertIsInstance(text[0].configuration_json, dict)

	def test_version_none_does_not_raise_type_error(self):
		spf = frappe.new_doc("Smart Print Format")
		spf.update({"title": "No version", "target_doctype": INVOICE, "version": None})
		with self.assertRaises(frappe.ValidationError):
			spf.validate_version()

	def test_table_props_drive_generated_table(self):
		layout = invoice_layout()
		find_node(layout, "items")["props"] = {
			"columns": [
				{"fieldname": "item_name", "label": "Description", "width": 60},
				{"fieldname": "amount", "width": 40},
			],
			"showHeader": True,
			"showTotal": True,
			"totalField": "grand_total",
		}
		self.assertTrue(validate_layout(INVOICE, layout)["valid"])
		result = generate(INVOICE, layout)
		self.assertIn("width: 60%", result["css"])
		self.assertIn("width: 40%", result["css"])

		rendered = frappe.render_template(result["html"], {"doc": make_invoice()})
		self.assertIn("<th>Description</th>", rendered)
		self.assertIn('<th class="spf-num">Amount</th>', rendered)
		self.assertNotIn('<th class="spf-num">Qty</th>', rendered)
		self.assertIn('class="spf-total-row"', rendered)
		self.assertIn("Grand Total", rendered)
		self.assertIn("125.50", rendered)

		find_node(layout, "items")["props"]["showHeader"] = False
		rendered = frappe.render_template(generate(INVOICE, layout)["html"], {"doc": make_invoice()})
		self.assertNotIn("<thead>", rendered)
		self.assertIn("Widget", rendered)

	def test_table_props_validation(self):
		layout = invoice_layout()
		find_node(layout, "items")["props"] = {
			"columns": [{"fieldname": "item_name", "width": 70}, {"fieldname": "amount", "width": 40}],
		}
		errors = validate_layout(INVOICE, layout)["errors"]
		self.assertEqual(errors[0]["node_id"], "items")
		self.assertIn("110%", errors[0]["message"])

		find_node(layout, "items")["props"] = {"showTotal": True, "totalField": "no_such_total"}
		self.assertIn("no_such_total", validate_layout(INVOICE, layout)["errors"][0]["message"])

		find_node(layout, "items")["props"] = {"columns": [{"fieldname": "missing"}]}
		self.assertIn("missing", validate_layout(INVOICE, layout)["errors"][0]["message"])

		layout = invoice_layout()
		find_node(layout, "customer")["props"]["showTotal"] = True
		self.assertIn("Only table fields", validate_layout(INVOICE, layout)["errors"][0]["message"])

	def test_preview_unsaved_format_and_document_search(self):
		invoice = make_invoice()
		result = api.preview_print(
			docname=invoice.name, layout_json=json.dumps(invoice_layout()), target_doctype=INVOICE
		)
		self.assertIn("Widget", result["html"])

		found = api.search_documents(INVOICE, invoice.name[:4])
		self.assertIn(invoice.name, [row["name"] for row in found])

		frappe.set_user(NO_ACCESS)
		with self.assertRaises(frappe.PermissionError):
			api.search_documents(INVOICE)
