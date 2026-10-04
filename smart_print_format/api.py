"""Whitelisted API of the Smart Print Format designer."""

import json

import frappe
from frappe import _
from frappe.model import no_value_fields
from frappe.sessions import get_csrf_token as get_session_csrf_token
from frappe.utils import cint, escape_html, now_datetime

from smart_print_format.html_generator import generate
from smart_print_format.validators import TABLE_FIELDTYPES, parse_layout
from smart_print_format.validators import validate_layout as check_layout

SPF = "Smart Print Format"
VERSION = "Smart Print Format Version"
COMPONENT = "Smart Print Format Component"
COMPONENT_TYPE = "Smart Print Format Component Type"
MANAGED_MARKER = "Managed by Smart Print Format: {0}"

VERSION_LIST_FIELDS = [
	"name",
	"version_number",
	"is_published",
	"change_summary",
	"created_by",
	"created_on",
]
PRINT_FORMAT_LIST_FIELDS = [
	"name",
	"doc_type",
	"module",
	"standard",
	"custom_format",
	"print_format_type",
	"disabled",
	"modified",
]
META_FIELD_KEYS = [
	"fieldname",
	"label",
	"fieldtype",
	"options",
	"in_list_view",
	"in_standard_filter",
	"reqd",
	"hidden",
	"print_hide",
	"bold",
	"idx",
]


class LayoutValidationError(frappe.ValidationError):
	pass


@frappe.whitelist(methods=["GET"])
def get_csrf_token():
	"""CSRF token of the current session, for the designer frontend."""
	return get_session_csrf_token()


@frappe.whitelist(methods=["GET"])
def get_doctypes(search=None):
	"""Printable DocTypes (not child tables or singles) the user can read."""
	readable = frappe.get_user().get_can_read()
	filters = {"name": ["in", readable], "istable": 0, "issingle": 0}
	if search:
		filters["name"] = ["like", f"%{search}%"]
	doctypes = frappe.get_all(
		"DocType",
		filters=filters,
		fields=["name", "module", "custom", "istable", "issingle"],
		order_by="name asc",
	)
	if search:
		allowed = set(readable)
		doctypes = [d for d in doctypes if d.name in allowed]
	return doctypes


@frappe.whitelist(methods=["GET"])
def get_doctype_metadata(doctype):
	"""Fields of `doctype` and of its child tables: {meta, childTables}."""
	require_doctype_read(doctype)
	meta = frappe.get_meta(doctype)
	child_tables = {
		df.options: meta_as_dict(frappe.get_meta(df.options), parenttype=doctype)
		for df in meta.fields
		if df.fieldtype in TABLE_FIELDTYPES and df.options
	}
	return {"meta": meta_as_dict(meta), "childTables": child_tables}


def meta_as_dict(meta, parenttype=None):
	"""The parts of a DocType's meta the designer uses, without fields the user may not read (permission levels)."""
	permitted = set(meta.get_permitted_fieldnames(parenttype=parenttype))
	fields = [
		{key: df.get(key) for key in META_FIELD_KEYS}
		for df in meta.fields
		if df.fieldtype in no_value_fields or df.fieldname in permitted
	]
	return {
		"name": meta.name,
		"module": meta.module,
		"istable": meta.istable,
		"issingle": meta.issingle,
		"fields": fields,
	}


@frappe.whitelist(methods=["GET"])
def get_print_formats(doctype):
	"""Enabled Print Formats for `doctype`."""
	require_doctype_read(doctype)
	return frappe.get_list(
		"Print Format",
		filters={"doc_type": doctype, "disabled": 0},
		fields=PRINT_FORMAT_LIST_FIELDS,
		order_by="name asc",
	)


@frappe.whitelist(methods=["GET"])
def get_smart_print_format(name):
	return as_response(get_spf(name, "read"))


@frappe.whitelist(methods=["POST"])
def create_smart_print_format(
	title=None, target_doctype=None, print_format=None, layout_json=None, description=None
):
	"""Create a Smart Print Format (as Draft) and its first version."""
	frappe.has_permission(SPF, "create", throw=True)
	require_doctype_read(target_doctype)

	layout = layout_arg(layout_json)
	generated = checked_generate(target_doctype, layout)

	doc = frappe.get_doc(
		{
			"doctype": SPF,
			"title": (title or "").strip() or _("{0} Format").format(target_doctype),
			"target_doctype": target_doctype,
			"print_format": print_format or None,
			"description": description,
			"status": "Draft",
			"is_active": 0,
			"version": 1,
			"layout_json": json.dumps(layout),
			"generated_html": generated["html"],
			"generated_css": generated["css"],
		}
	).insert()
	create_version(doc, _("Created"), layout, generated)
	return as_response(doc, generated["warnings"])


@frappe.whitelist(methods=["POST"])
def validate_layout(name=None, layout_json=None, target_doctype=None):
	"""Check a layout. Without `layout_json`, the stored layout of `name`."""
	target_doctype, layout = resolve_layout(name, layout_json, target_doctype)
	return check_layout(target_doctype, layout)


@frappe.whitelist(methods=["POST"])
def generate_print_html(name=None, layout_json=None, target_doctype=None):
	"""Jinja template + CSS for a layout: {html, css, warnings}. Throws if invalid."""
	target_doctype, layout = resolve_layout(name, layout_json, target_doctype)
	return checked_generate(target_doctype, layout)


@frappe.whitelist(methods=["POST"])
def save_layout(
	name,
	layout_json,
	change_summary=None,
	title=None,
	print_format=None,
	target_doctype=None,
	description=None,
):
	"""Validate, generate and store a layout, and record it as a new version."""
	doc = get_spf(name, "write")

	if title is not None:
		doc.title = title.strip() or doc.title
	if description is not None:
		doc.description = description
	if target_doctype and target_doctype != doc.target_doctype:
		require_doctype_read(target_doctype)
		doc.target_doctype = target_doctype
	if print_format is not None:
		doc.print_format = print_format or None
	require_doctype_read(doc.target_doctype)

	layout = layout_arg(layout_json)
	generated = checked_generate(doc.target_doctype, layout)

	latest = latest_version(doc.name)
	if not latest or not same_content(latest, layout, generated):
		version = create_version(doc, change_summary, layout, generated)
		doc.version = version.version_number

	doc.layout_json = json.dumps(layout)
	doc.generated_html = generated["html"]
	doc.generated_css = generated["css"]
	doc.save()
	return as_response(doc, generated["warnings"])


@frappe.whitelist(methods=["POST"])
def preview_print(name=None, docname=None, layout_json=None, target_doctype=None):
	"""Full HTML page (with CSS) of `docname` printed with this format."""
	if name:
		spf = get_spf(name, "read")
		target_doctype = target_doctype or spf.target_doctype
		layout = layout_arg(layout_json) if layout_json else stored_layout(spf)
	else:
		frappe.has_permission(SPF, "read", throw=True)
		layout = layout_arg(layout_json)
	require_doctype_read(target_doctype)
	generated = checked_generate(target_doctype, layout)

	if not docname or not frappe.db.exists(target_doctype, docname):
		frappe.throw(_("{0} {1} not found.").format(_(target_doctype), docname), frappe.DoesNotExistError)
	record = frappe.get_doc(target_doctype, docname)
	record.check_permission("read")

	body = frappe.render_template(generated["html"], {"doc": record})
	return {
		"html": (
			'<!doctype html><html><head><meta charset="utf-8">'
			f"<title>{escape_html(record.name)}</title>"
			# Same fallback font as Frappe's print view.
			f"<style>body {{ font-family: Inter, -apple-system, 'Segoe UI', Roboto, sans-serif; }}\n"
			f"{print_style()}\n{generated['css']}</style>"
			f'</head><body><div class="print-format">{body}</div></body></html>'
		),
		"warnings": generated["warnings"],
	}


@frappe.whitelist(methods=["GET"])
def search_documents(doctype, txt=None, limit=20):
	"""Documents of `doctype` the user can read, newest first, for picking a preview document: [{name, title}]."""
	require_doctype_read(doctype)
	meta = frappe.get_meta(doctype)
	title_field = meta.title_field if meta.title_field and meta.get_field(meta.title_field) else None
	fields = ["name"] + ([title_field] if title_field else [])
	or_filters = None
	if txt:
		or_filters = [["name", "like", f"%{txt}%"]]
		if title_field:
			or_filters.append([title_field, "like", f"%{txt}%"])
	rows = frappe.get_list(
		doctype,
		fields=fields,
		or_filters=or_filters,
		order_by="creation desc",
		limit_page_length=min(max(cint(limit), 1), 50),
	)
	return [{"name": row.name, "title": row.get(title_field) if title_field else None} for row in rows]


@frappe.whitelist(methods=["POST"])
def publish_print_format(name, change_summary=None):
	"""Make the current layout the one Frappe prints."""
	doc = get_spf(name, "write")
	require_doctype_read(doc.target_doctype)

	savepoint = "spf_publish"
	frappe.db.savepoint(savepoint)
	try:
		layout = stored_layout(doc)
		generated = checked_generate(doc.target_doctype, layout)
		print_format = write_print_format(doc, generated)

		version = latest_version(doc.name)
		if not version or not same_content(version, layout, generated):
			version = create_version(doc, change_summary or _("Published"), layout, generated)

		for other in frappe.get_all(
			VERSION,
			filters={"smart_print_format": doc.name, "is_published": 1, "name": ["!=", version.name]},
			pluck="name",
		):
			set_published(other, 0)
		set_published(version.name, 1)

		doc.update(
			{
				"print_format": print_format.name,
				"generated_html": generated["html"],
				"generated_css": generated["css"],
				"version": version.version_number,
				"status": "Active",
				"is_active": 1,
				"last_published_on": now_datetime(),
				"last_published_by": frappe.session.user,
			}
		)
		doc.save()
	except Exception:
		frappe.db.rollback(save_point=savepoint)
		raise

	return as_response(doc, generated["warnings"])


@frappe.whitelist(methods=["GET"])
def get_versions(name):
	get_spf(name, "read")
	return frappe.get_list(
		VERSION,
		filters={"smart_print_format": name},
		fields=VERSION_LIST_FIELDS,
		order_by="version_number desc",
		limit_page_length=0,
	)


@frappe.whitelist(methods=["GET"])
def get_version(name):
	"""One version with its layout (for comparing and previewing)."""
	version = frappe.get_doc(VERSION, name)
	version.check_permission("read")
	get_spf(version.smart_print_format, "read")
	return as_response(version)


@frappe.whitelist(methods=["POST"])
def restore_version(name, version_number):
	"""Copy an old version's layout back as the working layout."""
	doc = get_spf(name, "write")
	version_name = frappe.db.get_value(
		VERSION, {"smart_print_format": doc.name, "version_number": cint(version_number)}
	)
	if not version_name:
		frappe.throw(_("Version {0} not found.").format(version_number), frappe.DoesNotExistError)
	old = frappe.get_doc(VERSION, version_name)

	current = stored_layout(doc)
	backup = create_version(
		doc,
		_("Backup before restoring version {0}").format(old.version_number),
		current,
		{"html": doc.generated_html, "css": doc.generated_css},
	)

	layout = parse_layout(old.layout_json or '{"sections": []}')
	result = check_layout(doc.target_doctype, layout)
	warnings = result["warnings"]
	if result["valid"]:
		generated = generate(doc.target_doctype, layout)
		html, css = generated["html"], generated["css"]
		warnings += generated["warnings"]
	else:
		html, css = old.generated_html, old.generated_css
		warnings += result["errors"]

	doc.update(
		{
			"layout_json": json.dumps(layout),
			"generated_html": html,
			"generated_css": css,
			"version": backup.version_number,
		}
	)
	doc.save()
	return as_response(doc, warnings)


@frappe.whitelist(methods=["GET"])
def get_components(component_type=None):
	"""Active components (of active types), with configuration_json parsed."""
	filters = {"is_active": 1}
	if component_type:
		filters["component_type"] = component_type
	active_types = set(frappe.get_all(COMPONENT_TYPE, filters={"is_active": 1}, pluck="name"))
	components = frappe.get_list(
		COMPONENT,
		filters=filters,
		fields=[
			"name",
			"component_name",
			"component_type",
			"description",
			"configuration_json",
			"thumbnail_svg",
		],
		order_by="component_name asc",
		limit_page_length=0,
	)
	result = []
	for component in components:
		if component.component_type and component.component_type not in active_types:
			continue
		try:
			config = json.loads(component.configuration_json or "{}")
		except ValueError:
			config = {}
		component.configuration_json = config if isinstance(config, dict) else {}
		result.append(component)
	return result


def get_spf(name, ptype):
	if not name or not isinstance(name, str) or not frappe.db.exists(SPF, name):
		frappe.throw(_("Smart Print Format {0} not found.").format(name), frappe.DoesNotExistError)
	doc = frappe.get_doc(SPF, name)
	doc.check_permission(ptype)
	return doc


def require_doctype_read(doctype):
	if not doctype or not isinstance(doctype, str) or not frappe.db.exists("DocType", doctype):
		frappe.throw(_("DocType {0} not found.").format(doctype), frappe.DoesNotExistError)
	if not frappe.has_permission(doctype, "read"):
		frappe.throw(_("You do not have read permission on {0}.").format(_(doctype)), frappe.PermissionError)


def layout_arg(layout_json):
	if layout_json is None or layout_json == "":
		return {"sections": []}
	return parse_layout(layout_json)


def stored_layout(doc):
	return parse_layout(doc.layout_json or '{"sections": []}')


def resolve_layout(name, layout_json, target_doctype):
	if name:
		doc = get_spf(name, "read")
		target_doctype = target_doctype or doc.target_doctype
		layout = layout_arg(layout_json) if layout_json else stored_layout(doc)
	else:
		frappe.has_permission(SPF, "read", throw=True)
		layout = layout_arg(layout_json)
	require_doctype_read(target_doctype)
	return target_doctype, layout


def checked_generate(target_doctype, layout):
	"""Validate, then generate. Throws LayoutValidationError listing the errors."""
	result = check_layout(target_doctype, layout)
	if not result["valid"]:
		errors = result["errors"]
		shown = "; ".join(e["message"] for e in errors[:10])
		more = _(" (and {0} more)").format(len(errors) - 10) if len(errors) > 10 else ""
		frappe.throw(
			_("The layout has {0} error(s): {1}{2}").format(len(errors), shown, more),
			LayoutValidationError,
			title=_("Invalid layout"),
		)
	generated = generate(target_doctype, layout)
	generated["warnings"] = result["warnings"] + generated["warnings"]
	return generated


def latest_version(spf_name):
	name = frappe.db.get_value(
		VERSION, {"smart_print_format": spf_name}, "name", order_by="version_number desc"
	)
	return frappe.get_doc(VERSION, name) if name else None


def same_content(version, layout, generated):
	try:
		old_layout = json.loads(version.layout_json or "null")
	except ValueError:
		return False
	return (
		old_layout == layout
		and (version.generated_html or "") == generated["html"]
		and (version.generated_css or "") == generated["css"]
	)


def create_version(doc, change_summary, layout, generated):
	latest = frappe.db.get_value(
		VERSION, {"smart_print_format": doc.name}, "version_number", order_by="version_number desc"
	)
	version = frappe.get_doc(
		{
			"doctype": VERSION,
			"smart_print_format": doc.name,
			"version_number": cint(latest) + 1,
			"layout_json": json.dumps(layout),
			"generated_html": generated.get("html") or "",
			"generated_css": generated.get("css") or "",
			"change_summary": change_summary or "",
			"is_published": 0,
		}
	)
	version.insert()
	return version


def set_published(version_name, value):
	version = frappe.get_doc(VERSION, version_name)
	version.is_published = value
	version.flags.ignore_permissions = True
	version.save()


def write_print_format(doc, generated):
	"""Create or update the Print Format that prints `doc`'s layout."""
	marker = MANAGED_MARKER.format(doc.name)
	if doc.print_format and frappe.db.exists("Print Format", doc.print_format):
		print_format = frappe.get_doc("Print Format", doc.print_format)
		if print_format.standard == "Yes":
			frappe.throw(
				_(
					"Print Format {0} is a standard format and can't be overwritten. Choose a custom Print Format, or clear Format to create a new one on publish."
				).format(print_format.name)
			)
		html = print_format.html or ""
		if MANAGED_MARKER.format("") in html and marker not in html:
			frappe.throw(
				_("Print Format {0} is managed by another Smart Print Format.").format(print_format.name)
			)
		print_format.check_permission("write")
	else:
		frappe.has_permission("Print Format", "create", throw=True)
		print_format = frappe.new_doc("Print Format")
		print_format.name = unique_print_format_name(doc.title or doc.name, doc.name)

	print_format.update(
		{
			"doc_type": doc.target_doctype,
			"module": frappe.db.get_value("DocType", doc.target_doctype, "module"),
			"standard": "No",
			"custom_format": 1,
			"print_format_type": "Jinja",
			"print_format_builder": 0,
			"print_format_builder_beta": 0,
			"raw_printing": 0,
			"disabled": 0,
			"html": f"<!-- {marker} -->\n{generated['html']}",
			"css": generated["css"],
		}
	)
	if print_format.is_new():
		print_format.insert()
	else:
		print_format.save()
	return print_format


def unique_print_format_name(title, spf_name):
	name = title.strip()[:120]
	if frappe.db.exists("Print Format", name):
		name = f"{name} ({spf_name})"
	return name


def print_style():
	"""Frappe's standard print CSS, so previews look like the real print view."""
	try:
		from frappe.www.printview import get_print_style

		return get_print_style()
	except Exception:
		return ""


def as_response(doc, warnings=None):
	data = doc.as_dict(convert_dates_to_str=True)
	if "layout_json" in data:
		try:
			data["layout_json"] = parse_layout(data["layout_json"] or '{"sections": []}')
		except frappe.ValidationError:
			data["layout_json"] = None
	if warnings is not None:
		data["warnings"] = warnings
	return data
