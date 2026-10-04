"""Server-side validation of Smart Print Format layouts."""

import ast
import json
import os
import re

import frappe
from frappe import _
from frappe.utils.html_utils import sanitize_html

SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "layout_schema.json")

LAYOUT_FIELDTYPES = {"Section Break", "Column Break", "Tab Break", "Fold", "Button", "Heading"}
TABLE_FIELDTYPES = {"Table", "Table MultiSelect"}

STANDARD_FIELDS = {
	"name": "Data",
	"owner": "Link",
	"creation": "Datetime",
	"modified": "Datetime",
	"modified_by": "Link",
	"docstatus": "Int",
	"idx": "Int",
}

JINJA_DELIMITERS = ("{{", "}}", "{%", "%}", "{#", "#}")

MAX_LAYOUT_BYTES = 1024 * 1024


class Issues:
	def __init__(self):
		self.errors = []
		self.warnings = []

	def error(self, node_id, message):
		self.errors.append({"node_id": node_id, "message": message, "severity": "error"})

	def warning(self, node_id, message):
		self.warnings.append({"node_id": node_id, "message": message, "severity": "warning"})

	def result(self):
		return {"valid": not self.errors, "errors": self.errors, "warnings": self.warnings}


def parse_layout(layout):
	"""Layout as a dict, from a dict or a JSON string. Throws on bad input."""
	if isinstance(layout, str):
		if len(layout.encode()) > MAX_LAYOUT_BYTES:
			frappe.throw(_("Layout is too large."))
		try:
			layout = json.loads(layout)
		except ValueError as e:
			frappe.throw(_("Layout is not valid JSON: {0}").format(e))
	return layout


def validate_layout(target_doctype, layout, check_permission=True):
	"""Check a layout for printing `target_doctype`. See the module docstring."""
	issues = Issues()

	if (
		not target_doctype
		or not isinstance(target_doctype, str)
		or not frappe.db.exists("DocType", target_doctype)
	):
		issues.error(None, _("DocType '{0}' does not exist.").format(target_doctype))
		return issues.result()
	if check_permission and not frappe.has_permission(target_doctype, "read"):
		issues.error(None, _("You do not have read permission on {0}.").format(target_doctype))
		return issues.result()

	if isinstance(layout, str):
		try:
			layout = parse_layout(layout)
		except frappe.ValidationError as e:
			issues.error(None, str(e))
			return issues.result()

	for path, message in check_schema(layout, load_schema()):
		issues.error(node_id_at(layout, path), f"{format_path(path)}: {message}" if path else message)

	if not isinstance(layout, dict) or not isinstance(layout.get("sections"), list):
		return issues.result()

	LayoutChecker(target_doctype, issues).check(layout)
	return issues.result()


def check_condition(expression):
	"""Validate a "Depends On" condition."""
	text = (expression or "").strip()
	if text.startswith("eval:"):
		text = text[5:].strip()
	if not text:
		return None, None
	if len(text) > 500:
		return None, _("Condition is too long (500 characters at most).")

	try:
		tree = ast.parse(text, mode="eval")
	except SyntaxError:
		hint = ""
		if any(token in text for token in ("&&", "||", "===", "!==")):
			hint = " " + _("Use and / or / == / != instead of && / || / === / !==.")
		return None, _("Condition '{0}' is not a valid expression.{1} Example: doc.customer != ''").format(
			text, hint
		)

	problem = _condition_problem(tree.body)
	if problem:
		return None, _("Condition '{0}' is not allowed: {1}").format(text, problem)

	jinja = ast.unparse(tree.body)
	if any(delimiter in jinja for delimiter in JINJA_DELIMITERS):
		return None, _("Condition '{0}' may not contain Jinja delimiters.").format(text)
	return jinja, None


def sanitize_custom_html(html):
	"""Sanitized HTML that is safe to embed in a Jinja template."""
	clean = sanitize_html(html or "", always_sanitize=True)
	return neutralize_jinja(clean)


def neutralize_jinja(text):
	return re.sub(r"\{([{%#])", r"&#123;\1", text or "")


def escape_text(text):
	"""Plain text for the template: HTML-escaped, and no Jinja delimiters."""
	return neutralize_jinja(frappe.utils.escape_html(str(text or "")))


ALLOWED_ROOTS = {"doc", "row"}
ALLOWED_COMPARISONS = (ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.In, ast.NotIn)


def _condition_problem(node):
	"""Why `node` is not an allowed condition expression, or None."""
	if isinstance(node, ast.BoolOp):
		return next(filter(None, map(_condition_problem, node.values)), None)
	if isinstance(node, ast.UnaryOp):
		if isinstance(node.op, ast.Not):
			return _condition_problem(node.operand)
		if isinstance(node.op, ast.USub | ast.UAdd) and isinstance(node.operand, ast.Constant):
			return _constant_problem(node.operand)
		return _("unsupported operator")
	if isinstance(node, ast.Compare):
		if not all(isinstance(op, ALLOWED_COMPARISONS) for op in node.ops):
			return _("only ==, !=, <, <=, >, >=, in and not in comparisons are allowed")
		return next(filter(None, map(_condition_problem, [node.left, *node.comparators])), None)
	if isinstance(node, ast.Tuple | ast.List):
		for element in node.elts:
			if not isinstance(element, ast.Constant):
				return _("lists may only contain constants")
			if problem := _constant_problem(element):
				return problem
		return None
	if isinstance(node, ast.Constant):
		return _constant_problem(node)
	if isinstance(node, ast.Name | ast.Attribute | ast.Subscript):
		return _reference_problem(node)
	if isinstance(node, ast.Call):
		return _("function calls are not allowed")
	return _("'{0}' expressions are not allowed").format(type(node).__name__)


def _constant_problem(node):
	if node.value is not None and not isinstance(node.value, str | int | float | bool):
		return _("unsupported constant")
	return None


def _reference_problem(node):
	"""doc, row, doc.field, row.field.sub, doc['field'] are allowed."""
	if isinstance(node, ast.Name):
		if node.id not in ALLOWED_ROOTS:
			return _("unknown name '{0}' (use doc or row)").format(node.id)
		return None
	if isinstance(node, ast.Attribute):
		if node.attr.startswith("_"):
			return _("attribute '{0}' is not allowed").format(node.attr)
		return _reference_problem(node.value)
	if isinstance(node, ast.Subscript):
		key = node.slice
		if (
			not isinstance(key, ast.Constant)
			or not isinstance(key.value, str | int)
			or isinstance(key.value, bool)
		):
			return _("only constant keys may be used in [ ]")
		if isinstance(key.value, str) and key.value.startswith("_"):
			return _("key '{0}' is not allowed").format(key.value)
		return _reference_problem(node.value)
	return _("only doc and row may be subscripted")


def condition_fields(expression):
	"""doc.<fieldname> references in a valid condition, for meta checks."""
	jinja, error = check_condition(expression)
	if error or not jinja:
		return []
	fields = []
	for node in ast.walk(ast.parse(jinja, mode="eval")):
		if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id == "doc":
			fields.append(node.attr)
	return fields


class LayoutChecker:
	def __init__(self, target_doctype, issues):
		self.doctype = target_doctype
		self.meta = frappe.get_meta(target_doctype)
		self.issues = issues
		self.seen_ids = set()
		self.components = {}

	def check(self, layout):
		sections = layout["sections"]
		kinds = [s.get("kind") if isinstance(s, dict) else None for s in sections]
		for kind in ("header", "footer"):
			if kinds.count(kind) > 1:
				self.issues.error(None, _("A layout can have only one {0} section.").format(kind))
		for index, section in enumerate(sections):
			if not isinstance(section, dict):
				continue
			if section.get("kind") == "header" and index != 0:
				self.issues.error(section.get("id"), _("The header section must be the first section."))
			if section.get("kind") == "footer" and index != len(sections) - 1:
				self.issues.error(section.get("id"), _("The footer section must be the last section."))
			self.check_node(section, self.meta)
			for column in section.get("columns") or []:
				if not isinstance(column, dict):
					continue
				self.check_node(column, self.meta)
				for item in column.get("fields") or []:
					if not isinstance(item, dict):
						continue
					self.check_node(item, self.meta)
					if item.get("type") == "field":
						self.check_field(item)
					elif item.get("type") == "component":
						self.check_component(item)

	def check_node(self, node, meta):
		node_id = node.get("id")
		if isinstance(node_id, str):
			if node_id in self.seen_ids:
				self.issues.error(node_id, _("Duplicate node id '{0}'.").format(node_id))
			self.seen_ids.add(node_id)

		props = node.get("props")
		if isinstance(props, dict) and isinstance(props.get("condition"), str):
			_jinja, error = check_condition(props["condition"])
			if error:
				self.issues.error(node_id, error)
			else:
				for fieldname in condition_fields(props["condition"]):
					if not self.has_field(meta, fieldname):
						self.issues.warning(
							node_id,
							_("Condition uses doc.{0}, which is not a field of {1}.").format(
								fieldname, self.doctype
							),
						)

	def has_field(self, meta, fieldname):
		return fieldname in STANDARD_FIELDS or bool(meta.get_field(fieldname))

	def check_field(self, node):
		node_id = node.get("id")
		fieldname = node.get("fieldname")
		if not isinstance(fieldname, str) or not fieldname:
			return

		table, _dot, child_fieldname = fieldname.partition(".")
		df = self.meta.get_field(table)
		if not df and table not in STANDARD_FIELDS:
			self.issues.error(node_id, _("Field '{0}' does not exist in {1}.").format(table, self.doctype))
			return

		fieldtype = df.fieldtype if df else STANDARD_FIELDS[table]
		if fieldtype in LAYOUT_FIELDTYPES:
			self.issues.error(node_id, _("'{0}' is a {1} and cannot be printed.").format(table, fieldtype))
			return

		is_table = fieldtype in TABLE_FIELDTYPES
		if node.get("fieldtype") in TABLE_FIELDTYPES and not is_table:
			self.issues.error(node_id, _("Field '{0}' is not a table in {1}.").format(table, self.doctype))
			return
		if node.get("fieldtype") and node.get("fieldtype") != fieldtype and not child_fieldname:
			self.issues.warning(
				node_id,
				_("Field '{0}' is a {1} field, not {2}; it will print as {1}.").format(
					table, fieldtype, node.get("fieldtype")
				),
			)

		if child_fieldname:
			if not is_table:
				self.issues.error(
					node_id, _("'{0}' is not a table, so '{1}' is invalid.").format(table, fieldname)
				)
				return
			if not self.has_field(frappe.get_meta(df.options), child_fieldname):
				self.issues.error(
					node_id,
					_("Field '{0}' does not exist in {1}.").format(child_fieldname, df.options),
				)
			return

		if is_table:
			if node.get("options") and node.get("options") != df.options:
				self.issues.error(
					node_id,
					_("Table '{0}' holds {1} rows, not {2}.").format(table, df.options, node.get("options")),
				)
			self.check_table_columns(node, df)
			self.check_table_total(node)
		elif node.get("table") or any(key in (node.get("props") or {}) for key in TABLE_PROPS):
			self.issues.error(
				node_id, _("Only table fields can have table settings (columns, header, total).")
			)

	def check_table_columns(self, node, df):
		child_meta = frappe.get_meta(df.options)
		columns = table_column_config(node)
		seen, total_width = set(), 0
		for column in columns:
			fieldname = column.get("fieldname") if isinstance(column, dict) else None
			if not isinstance(fieldname, str):
				continue
			if fieldname in seen:
				self.issues.error(node.get("id"), _("Table column '{0}' is listed twice.").format(fieldname))
			seen.add(fieldname)
			child_df = child_meta.get_field(fieldname)
			if not child_df and fieldname not in STANDARD_FIELDS:
				self.issues.error(
					node.get("id"),
					_("Table column '{0}' does not exist in {1}.").format(fieldname, df.options),
				)
			elif child_df and child_df.fieldtype in LAYOUT_FIELDTYPES | TABLE_FIELDTYPES:
				self.issues.error(
					node.get("id"),
					_("Table column '{0}' ({1}) cannot be printed.").format(fieldname, child_df.fieldtype),
				)
			width = column.get("width")
			if isinstance(width, int | float) and not isinstance(width, bool):
				total_width += width
		if total_width > 100:
			self.issues.error(
				node.get("id"),
				_("Table column widths add up to {0}%; they may add up to 100% at most.").format(
					round(total_width, 2)
				),
			)

	def check_table_total(self, node):
		props = node.get("props") or {}
		total_field = props.get("totalField")
		if not props.get("showTotal"):
			return
		if not total_field:
			self.issues.error(node.get("id"), _("Choose the field to show in the table's total row."))
			return
		df = self.meta.get_field(total_field)
		if not df:
			self.issues.error(
				node.get("id"),
				_("Total field '{0}' does not exist in {1}.").format(total_field, self.doctype),
			)
		elif df.fieldtype in LAYOUT_FIELDTYPES | TABLE_FIELDTYPES:
			self.issues.error(
				node.get("id"),
				_("Total field '{0}' ({1}) cannot be printed.").format(total_field, df.fieldtype),
			)

	def check_component(self, node):
		node_id = node.get("id")
		name = node.get("component")
		if not isinstance(name, str) or not name:
			return

		component = get_component(name)
		if not component:
			self.issues.error(node_id, _("Component '{0}' does not exist.").format(name))
			return
		if not component.is_active:
			self.issues.error(node_id, _("Component '{0}' is not active.").format(name))
			return
		if component.component_type and not frappe.db.get_value(
			"Smart Print Format Component Type", component.component_type, "is_active"
		):
			self.issues.error(
				node_id, _("Component type '{0}' is not active.").format(component.component_type)
			)
			return

		config = component_configuration(component, node)
		if component.component_type == "HTML":
			html = config.get("html") or ""
			if not isinstance(html, str):
				self.issues.error(node_id, _("Custom HTML must be text."))
			elif sanitize_html(html, always_sanitize=True) != html or neutralize_jinja(html) != html:
				self.issues.warning(
					node_id,
					_(
						"Custom HTML in '{0}' contains scripts, event handlers, unsafe links or template code; they are removed when printing."
					).format(name),
				)
		elif component.component_type == "Image" and config.get("source") == "url":
			if not is_safe_image_url(config.get("url")):
				self.issues.error(node_id, _("Image URL must start with https://, http:// or /files/."))


TABLE_PROPS = ("columns", "showHeader", "showTotal", "totalField")


def table_column_config(node):
	"""The table's configured columns: props.columns, else the legacy table.columns."""
	columns = (node.get("props") or {}).get("columns")
	if isinstance(columns, list) and columns:
		return columns
	table = node.get("table")
	legacy = table.get("columns") if isinstance(table, dict) else None
	return legacy if isinstance(legacy, list) else []


def get_component(name):
	return frappe.db.get_value(
		"Smart Print Format Component",
		name,
		["name", "component_name", "component_type", "configuration_json", "is_active"],
		as_dict=True,
	)


def component_configuration(component, node=None):
	"""Stored configuration, overridden by the node's own `configuration`."""
	config = {}
	try:
		stored = json.loads(component.configuration_json or "{}")
		if isinstance(stored, dict):
			config.update(stored)
	except ValueError:
		pass
	override = (node or {}).get("configuration")
	if isinstance(override, dict):
		config.update(override)
	return config


def is_safe_image_url(url):
	return (
		isinstance(url, str)
		and re.match(r"^(https?://|/files/|/private/files/)[^\s\"'<>]*$", url) is not None
	)


_schema_cache = None


def load_schema():
	global _schema_cache
	if _schema_cache is None:
		with open(SCHEMA_PATH) as f:
			_schema_cache = json.load(f)
	return _schema_cache


JSON_TYPES = {
	"object": lambda v: isinstance(v, dict),
	"array": lambda v: isinstance(v, list),
	"string": lambda v: isinstance(v, str),
	"number": lambda v: isinstance(v, int | float) and not isinstance(v, bool),
	"integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
	"boolean": lambda v: isinstance(v, bool),
	"null": lambda v: v is None,
}


def check_schema(value, schema, root=None, path=()):
	"""Yield (path, message) for every place `value` doesn't match `schema`."""
	root = root or schema
	if "$ref" in schema:
		schema = _resolve(root, schema["$ref"])

	if "oneOf" in schema:
		key = schema.get("discriminator")
		options = [_resolve(root, s["$ref"]) if "$ref" in s else s for s in schema["oneOf"]]
		if key and isinstance(value, dict):
			match = [
				o for o in options if o.get("properties", {}).get(key, {}).get("const") == value.get(key)
			]
			if not match:
				allowed = ", ".join(repr(o["properties"][key]["const"]) for o in options)
				yield path, f"'{key}' must be one of {allowed}"
				return
			yield from check_schema(value, match[0], root, path)
			return
		if not any(not list(check_schema(value, o, root, path)) for o in options):
			yield path, "does not match any allowed shape"
		return

	expected = schema.get("type")
	if expected and not JSON_TYPES[expected](value):
		yield path, f"must be of type {expected}"
		return
	if "const" in schema and value != schema["const"]:
		yield path, f"must be {schema['const']!r}"
	if "enum" in schema and value not in schema["enum"]:
		yield path, "must be one of " + ", ".join(repr(v) for v in schema["enum"])

	if isinstance(value, str):
		if len(value) < schema.get("minLength", 0):
			yield (
				path,
				"must not be empty"
				if schema["minLength"] == 1
				else f"is too short (min {schema['minLength']})",
			)
		if "maxLength" in schema and len(value) > schema["maxLength"]:
			yield path, f"is too long (max {schema['maxLength']} characters)"
		if "pattern" in schema and not re.search(schema["pattern"], value):
			yield path, f"has an invalid value {value[:60]!r}"

	if JSON_TYPES["number"](value):
		if "minimum" in schema and value < schema["minimum"]:
			yield path, f"must be at least {schema['minimum']}"
		if "maximum" in schema and value > schema["maximum"]:
			yield path, f"must be at most {schema['maximum']}"

	if isinstance(value, list):
		if len(value) < schema.get("minItems", 0):
			yield path, f"needs at least {schema['minItems']} item(s)"
		if "maxItems" in schema and len(value) > schema["maxItems"]:
			yield path, f"has too many items (max {schema['maxItems']})"
		if "items" in schema:
			for index, item in enumerate(value):
				yield from check_schema(item, schema["items"], root, (*path, index))

	if isinstance(value, dict):
		for key in schema.get("required", []):
			if key not in value:
				yield path, f"'{key}' is required"
		properties = schema.get("properties", {})
		for key, item in value.items():
			if key in properties:
				yield from check_schema(item, properties[key], root, (*path, key))
			elif schema.get("additionalProperties") is False:
				yield path, f"unknown property '{key}'"


def _resolve(root, ref):
	node = root
	for part in ref.removeprefix("#/").split("/"):
		node = node[part]
	return node


def format_path(path):
	text = ""
	for part in path:
		text += f"[{part}]" if isinstance(part, int) else (f".{part}" if text else part)
	return text


def node_id_at(layout, path):
	"""id of the innermost node on `path` (a section, column, field or component)."""
	node_id, value = None, layout
	for part in path:
		try:
			value = value[part]
		except KeyError, IndexError, TypeError:
			break
		if isinstance(value, dict) and isinstance(value.get("id"), str) and value.get("type"):
			node_id = value["id"]
	return node_id
