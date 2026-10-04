"""Layout JSON -> Jinja print template + CSS."""

import re

import frappe
from frappe import _

from smart_print_format.validators import (
	LAYOUT_FIELDTYPES,
	STANDARD_FIELDS,
	TABLE_FIELDTYPES,
	check_condition,
	component_configuration,
	escape_text,
	get_component,
	is_safe_image_url,
	sanitize_custom_html,
	table_column_config,
)

FORMATTED = '{{{{ {v}.get_formatted("{f}"{p}) | e }}}}'
FIELDTYPE_TEMPLATES = {
	"Check": '{{{{ _("Yes") if {v}.{f} else _("No") }}}}',
	"Attach Image": '{{% if {v}.{f} %}}<img class="spf-img" src="{{{{ {v}.{f} | e }}}}">{{% endif %}}',
	"Image": '{{% if {v}.{f} %}}<img class="spf-img" src="{{{{ {v}.{f} | e }}}}">{{% endif %}}',
	"Signature": '{{% if {v}.{f} %}}<img class="spf-img" src="{{{{ {v}.{f} | e }}}}">{{% endif %}}',
	"Text Editor": '{{{{ {v}.{f} or "" }}}}',
	"Text": '{{{{ ({v}.{f} or "") | e | replace("\\n", "<br>") }}}}',
	"Small Text": '{{{{ ({v}.{f} or "") | e | replace("\\n", "<br>") }}}}',
	"Long Text": '{{{{ ({v}.{f} or "") | e | replace("\\n", "<br>") }}}}',
	"Code": '<pre class="spf-code">{{{{ ({v}.{f} or "") | e }}}}</pre>',
	"Markdown Editor": '{{{{ {v}.get_formatted("{f}"{p}) }}}}',
}
NUMERIC_FIELDTYPES = {"Currency", "Float", "Int", "Percent"}

BASE_CSS = """
.spf-print { font-size: 12px; color: #1f2328; }
.spf-print .spf-section { display: table; table-layout: fixed; width: 100%; margin-bottom: 12px; }
.spf-print .spf-col { display: table-cell; vertical-align: top; padding-right: 12px; }
.spf-print .spf-col:last-child { padding-right: 0; }
@supports (display: grid) {
	.spf-print .spf-section { display: grid; column-gap: 12px; }
	.spf-print .spf-col { display: block; padding-right: 0; min-width: 0; }
}
.spf-print .spf-section-label { font-size: 13px; font-weight: bold; margin: 0 0 6px; padding-bottom: 3px; border-bottom: 1px solid #d1d8dd; }
.spf-print .spf-field { margin-bottom: 6px; }
.spf-print .spf-label { font-size: 10px; color: #6c7680; }
.spf-print .spf-total { margin: 6px 0; text-align: right; font-weight: bold; }
.spf-print .spf-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
.spf-print .spf-table th, .spf-print .spf-table td { border: 1px solid #d1d8dd; padding: 4px 6px; text-align: left; vertical-align: top; }
.spf-print .spf-table th { background: #f4f5f6; font-size: 11px; }
.spf-print .spf-table .spf-num { text-align: right; }
.spf-print .spf-table .spf-total-row td { font-weight: bold; background: #f4f5f6; }
.spf-print .spf-img { max-width: 100%; max-height: 120px; }
.spf-print .spf-logo { max-width: 100%; }
.spf-print .spf-code { white-space: pre-wrap; margin: 0; font-size: 11px; }
.spf-print .spf-divider { border: 0; border-top: 1px solid #d1d8dd; margin: 8px 0; }
.spf-print .spf-signature { margin-top: 32px; display: inline-block; text-align: center; }
.spf-print .spf-signature-line { border-top: 1px solid #1f2328; margin-bottom: 4px; }
.spf-print .spf-page-number { font-size: 10px; color: #6c7680; }
#footer-html .spf-section { margin-bottom: 0; }
""".strip()


def generate(target_doctype, layout):
	return Generator(target_doctype).run(layout)


class Generator:
	def __init__(self, target_doctype):
		self.doctype = target_doctype
		self.meta = frappe.get_meta(target_doctype)
		self.warnings = []
		self.css = []

	def warn(self, node, message):
		self.warnings.append({"node_id": (node or {}).get("id"), "message": message, "severity": "warning"})

	def run(self, layout):
		body, footer = [], ""
		for section in (layout or {}).get("sections") or []:
			html = self.section(section)
			if section.get("kind") == "footer":
				footer = html
			else:
				body.append(html)

		if footer:
			body.append(
				f'<div id="footer-html" class="spf-footer"><div class="spf-print">{footer}</div></div>'
			)

		html = '<div class="spf-print">\n' + "\n".join(filter(None, body)) + "\n</div>"
		css = BASE_CSS + ("\n" + "\n".join(self.css) if self.css else "")
		return {"html": html, "css": css, "warnings": self.warnings}

	def node_class(self, node, extra=None):
		"""spf-n-<id>, with a CSS rule for the node's props (and `extra` rules)."""
		props = node.get("props") or {}
		rules = style_rules(props, include_width=node.get("type") in ("field", "component"))
		rules += extra or []
		cls = f"spf-n-{node['id']}"
		if rules:
			self.css.append(f".spf-print .{cls} {{ {'; '.join(rules)}; }}")
		return cls

	def conditional(self, node, html):
		"""Wrap `html` in {% if %} when the node has a condition."""
		condition = (node.get("props") or {}).get("condition")
		if not condition or not html:
			return html
		jinja, error = check_condition(condition)
		if error:
			self.warn(node, error)
			return ""
		return f"{{% if {jinja} %}}{html}{{% endif %}}" if jinja else html

	def section(self, section):
		props = section.get("props") or {}
		if props.get("hidden"):
			return ""
		columns = section.get("columns") or []
		visible = [c for c in columns if not (c.get("props") or {}).get("hidden")]
		if not visible:
			return ""

		widths = [(c.get("props") or {}).get("width") for c in visible]
		template = " ".join(f"{w}%" if valid_number(w, 1, 100) else "minmax(0, 1fr)" for w in widths)
		cls = self.node_class(section)
		self.css.append(
			f"@supports (display: grid) {{ .spf-print .{cls} {{ grid-template-columns: {template}; }} }}"
		)

		label = props.get("label") or section.get("label")
		heading = f'<div class="spf-section-label">{escape_text(label)}</div>' if label else ""
		kind = f" spf-{section['kind']}" if section.get("kind") in ("header", "footer") else ""

		cells = "".join(self.column(column) for column in visible)
		row = f'<div class="spf-section spf-cols-{len(visible)}{kind} {cls}">{cells}</div>'
		return self.conditional(section, heading + row)

	def column(self, column):
		width = (column.get("props") or {}).get("width")
		extra = [f"width: {width}%"] if valid_number(width, 1, 100) else []
		cls = self.node_class(column, extra)

		parts, after_table = [], None
		for item in column.get("fields") or []:
			if item.get("type") == "component":
				parts.append(self.component(item))
			elif item.get("type") == "field":
				parts.append(self.field(item, total=after_table is not None))
				if self.is_table(item):
					after_table = item
		content = self.conditional(column, "".join(parts))
		return f'<div class="spf-col {cls}">{content}</div>'

	def get_df(self, meta, fieldname):
		df = meta.get_field(fieldname)
		if df:
			return df
		if fieldname in STANDARD_FIELDS:
			return frappe._dict(fieldname=fieldname, fieldtype=STANDARD_FIELDS[fieldname], label=fieldname)
		return None

	def is_table(self, node):
		df = self.get_df(self.meta, (node.get("fieldname") or "").partition(".")[0])
		return bool(df and df.fieldtype in TABLE_FIELDTYPES and "." not in node.get("fieldname", ""))

	def field(self, node, total=False):
		props = node.get("props") or {}
		if props.get("hidden"):
			return ""
		fieldname = node.get("fieldname") or ""
		table, _dot, child_fieldname = fieldname.partition(".")
		df = self.get_df(self.meta, table)
		if not df or df.fieldtype in LAYOUT_FIELDTYPES:
			self.warn(
				node, _("Field '{0}' was skipped: it does not exist in {1}.").format(fieldname, self.doctype)
			)
			return ""

		if child_fieldname:
			child_df = (
				self.get_df(frappe.get_meta(df.options), child_fieldname)
				if df.fieldtype in TABLE_FIELDTYPES
				else None
			)
			if not child_df:
				self.warn(node, _("Field '{0}' was skipped.").format(fieldname))
				return ""
			value = value_template(child_df, "doc.{0}[0]".format(table), ", doc")
			value = f"{{% if doc.{table} %}}{value}{{% endif %}}"
			label = props.get("label") or node.get("label") or child_df.label or child_fieldname
		elif df.fieldtype in TABLE_FIELDTYPES:
			return self.conditional(node, self.table(node, df))
		else:
			value = value_template(df, "doc", "")
			label = props.get("label") or node.get("label") or df.label or fieldname

		cls = self.node_class(node)
		if total:
			prefix = "" if props.get("hideLabel") else f"{escape_text(label)}: "
			html = f'<div class="spf-total {cls}">{prefix}{value}</div>'
		else:
			label_html = (
				"" if props.get("hideLabel") else f'<div class="spf-label">{escape_text(label)}</div>'
			)
			html = f'<div class="spf-field {cls}">{label_html}<div class="spf-value">{value}</div></div>'
		return self.conditional(node, html)

	def table(self, node, df):
		"""Child table: header row, one row per child record, optional total row."""
		props = node.get("props") or {}
		child_meta = frappe.get_meta(df.options)
		columns = self.table_columns(node, child_meta)
		if not columns:
			self.warn(node, _("Table '{0}' has no printable columns.").format(df.fieldname))
			return ""

		cls = self.node_class(node)
		head, cells, cols = [], [], []
		for index, (child_df, label, width) in enumerate(columns):
			col_cls = f"{cls}-c{index}"
			if width:
				self.css.append(f".spf-print .{col_cls} {{ width: {width}%; }}")
			cols.append(f'<col class="{col_cls}">')
			num = ' class="spf-num"' if child_df.fieldtype in NUMERIC_FIELDTYPES else ""
			head.append(f"<th{num}>{escape_text(label)}</th>")
			cells.append(f"<td{num}>{value_template(child_df, 'row', ', doc')}</td>")

		thead = (
			f"<thead><tr>{''.join(head)}</tr></thead>" if props.get("showHeader", True) is not False else ""
		)
		tfoot = self.table_total(node, len(columns))

		caption = (
			""
			if not props.get("label") or props.get("hideLabel")
			else (f'<div class="spf-label">{escape_text(props["label"])}</div>')
		)
		return (
			f'<div class="{cls}">{caption}<table class="spf-table">'
			f"<colgroup>{''.join(cols)}</colgroup>"
			f"{thead}"
			f"<tbody>{{% for row in doc.{df.fieldname} %}}<tr>{''.join(cells)}</tr>{{% endfor %}}</tbody>"
			f"{tfoot}"
			"</table></div>"
		)

	def table_total(self, node, column_count):
		"""<tfoot> with the total field's label and value, when showTotal is on."""
		props = node.get("props") or {}
		if not props.get("showTotal") or not props.get("totalField"):
			return ""
		df = self.meta.get_field(props["totalField"])
		if not df or df.fieldtype in LAYOUT_FIELDTYPES | TABLE_FIELDTYPES:
			self.warn(node, _("Total field '{0}' was skipped.").format(props["totalField"]))
			return ""
		label = escape_text(df.label or df.fieldname)
		value = value_template(df, "doc", "")
		if column_count == 1:
			return f'<tfoot><tr class="spf-total-row"><td>{label}: {value}</td></tr></tfoot>'
		return (
			f'<tfoot><tr class="spf-total-row"><td colspan="{column_count - 1}">{label}</td>'
			f'<td class="spf-num">{value}</td></tr></tfoot>'
		)

	def table_columns(self, node, child_meta):
		"""[(docfield, label, width%)] from the table's configured columns, else In List View fields."""
		configured = table_column_config(node)
		columns = []
		if configured:
			for column in configured:
				child_df = self.get_df(child_meta, column.get("fieldname") or "")
				if not child_df or child_df.fieldtype in LAYOUT_FIELDTYPES | TABLE_FIELDTYPES:
					self.warn(node, _("Table column '{0}' was skipped.").format(column.get("fieldname")))
					continue
				width = column.get("width") if valid_number(column.get("width"), 1, 100) else None
				columns.append((child_df, column.get("label") or child_df.label or child_df.fieldname, width))
			return columns

		fields = [
			df
			for df in child_meta.fields
			if df.fieldtype not in LAYOUT_FIELDTYPES | TABLE_FIELDTYPES and not df.print_hide
		]
		chosen = [df for df in fields if df.in_list_view] or fields[:5]
		return [(df, df.label or df.fieldname, None) for df in chosen]

	def component(self, node):
		props = node.get("props") or {}
		if props.get("hidden"):
			return ""
		component = get_component(node.get("component") or "")
		if not component or not component.is_active:
			self.warn(
				node,
				_("Component '{0}' was skipped: it does not exist or is inactive.").format(
					node.get("component")
				),
			)
			return ""

		config = component_configuration(component, node)
		render = {
			"Image": self.image_component,
			"Divider": self.divider_component,
			"HTML": self.html_component,
			"Page Number": self.page_number_component,
			"Text": self.text_component,
			"Signature": self.signature_component,
		}.get(component.component_type)
		if not render:
			self.warn(node, _("Component type '{0}' cannot be printed yet.").format(component.component_type))
			return ""
		return self.conditional(node, render(node, config))

	def image_component(self, node, config):
		align = config.get("align")
		cls = self.node_class(node, [f"text-align: {align}"] if align in ("left", "center", "right") else [])
		if valid_number(config.get("max_height"), 10, 400):
			self.css.append(f".spf-print .{cls} img {{ max-height: {config['max_height']}px; }}")
		source = config.get("source") or "company_logo"
		if source == "url":
			url = config.get("url")
			if not is_safe_image_url(url):
				self.warn(node, _("Image skipped: the URL is not allowed."))
				return ""
			return f'<div class="{cls}"><img class="spf-logo" src="{escape_text(url)}"></div>'

		var = "spf_logo_" + node["id"].replace("-", "_")
		lookups = []
		company_df = self.meta.get_field("company")
		if (
			source == "company_logo"
			and company_df
			and company_df.fieldtype == "Link"
			and company_df.options == "Company"
			and frappe.db.exists("DocType", "Company")
			and frappe.get_meta("Company").get_field("company_logo")
		):
			lookups.append(
				f'{{% set {var} = frappe.db.get_value("Company", doc.company, "company_logo") if doc.company else None %}}'
			)
		else:
			lookups.append(f"{{% set {var} = None %}}")
		lookups.append(
			f'{{% if not {var} %}}{{% set {var} = frappe.db.get_value("Letter Head", {{"is_default": 1, "disabled": 0}}, "image") %}}{{% endif %}}'
		)
		return (
			"".join(lookups)
			+ f'{{% if {var} %}}<div class="{cls}"><img class="spf-logo" src="{{{{ {var} | e }}}}"></div>{{% endif %}}'
		)

	def divider_component(self, node, config):
		rules = []
		thickness = config.get("thickness")
		style = (
			config.get("style") if config.get("style") in ("solid", "dashed", "dotted", "double") else "solid"
		)
		color = config.get("color") if valid_color(config.get("color")) else "#d1d8dd"
		if valid_number(thickness, 0.5, 10):
			rules.append(f"border-top: {thickness}px {style} {color}")
		return f'<hr class="spf-divider {self.node_class(node, rules)}">'

	def html_component(self, node, config):
		html = config.get("html") if isinstance(config.get("html"), str) else ""
		return f'<div class="spf-html {self.node_class(node)}">{sanitize_custom_html(html)}</div>'

	def page_number_component(self, node, config):
		prefix = escape_text(config.get("prefix") or _("Page"))
		separator = escape_text(config.get("separator") or _("of"))
		return (
			f'<div class="spf-page-number visible-pdf {self.node_class(node)}">'
			f'{prefix} <span class="page"></span> {separator} <span class="topage"></span></div>'
		)

	def text_component(self, node, config):
		text = escape_text(config.get("text") or "").replace("\n", "<br>")
		return f'<div class="spf-text {self.node_class(node)}">{text}</div>'

	def signature_component(self, node, config):
		width = config.get("line_width")
		rules = [f"width: {width}px"] if valid_number(width, 20, 600) else []
		label = escape_text(config.get("label") or _("Signature"))
		return (
			f'<div class="spf-signature {self.node_class(node, rules)}">'
			f'<div class="spf-signature-line"></div><div class="spf-label">{label}</div></div>'
		)


def value_template(df, var, parent_arg):
	template = FIELDTYPE_TEMPLATES.get(df.fieldtype, FORMATTED)
	return template.format(v=var, f=df.fieldname, p=parent_arg)


def valid_number(value, low, high):
	return isinstance(value, int | float) and not isinstance(value, bool) and low <= value <= high


def valid_color(value):
	return (
		isinstance(value, str)
		and re.fullmatch(
			r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|[a-zA-Z]{3,20}", value
		)
		is not None
	)


def style_rules(props, include_width=True):
	rules = []
	if valid_number(props.get("fontSize"), 6, 72):
		rules.append(f"font-size: {props['fontSize']}px")
	if props.get("bold") is True:
		rules.append("font-weight: bold")
	if props.get("align") in ("left", "center", "right"):
		rules.append(f"text-align: {props['align']}")
	if valid_color(props.get("color")):
		rules.append(f"color: {props['color']}")
	if include_width and valid_number(props.get("width"), 1, 100):
		rules.append(f"width: {props['width']}%")
	return rules
