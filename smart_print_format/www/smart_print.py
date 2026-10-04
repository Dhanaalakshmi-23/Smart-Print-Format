import json
import os
from urllib.parse import quote

import frappe
from frappe import _
from frappe.sessions import get_csrf_token

no_cache = 1

ASSET_BASE = "/assets/smart_print_format/frontend/"
ENTRY = "index.html"


def get_context(context):
	if frappe.session.user == "Guest":
		path = "/" + (frappe.local.request.path.lstrip("/") if frappe.local.request else "smart-print")
		frappe.local.flags.redirect_location = "/login?redirect-to=" + quote(path)
		# 302: browsers cache a 301 and would keep sending logged-in users to /login.
		redirect = frappe.Redirect()
		redirect.http_status_code = 302
		raise redirect

	if not frappe.has_permission("Smart Print Format", "read"):
		frappe.throw(_("You do not have permission to use Smart Print Format."), frappe.PermissionError)

	context.no_cache = 1
	context.assets = get_assets()
	context.boot = {
		"csrf_token": get_csrf_token(),
		"boot": {
			"user": frappe.session.user,
			"lang": frappe.local.lang or "en",
			"site_name": frappe.local.site,
		},
	}
	# GET requests aren't committed by default; keep the CSRF token just created.
	frappe.db.commit()
	return context


def get_assets():
	"""Entry script, CSS files and preloads of the built frontend, or None."""
	manifest_path = frappe.get_app_path("smart_print_format", "public", "frontend", ".vite", "manifest.json")
	if not os.path.exists(manifest_path):
		return None

	with open(manifest_path) as f:
		manifest = json.load(f)

	entry = manifest.get(ENTRY)
	if not entry:
		return None

	css, preloads, seen = [], [], set()

	def collect(key, is_entry=False):
		if key in seen or key not in manifest:
			return
		seen.add(key)
		chunk = manifest[key]
		css.extend(chunk.get("css", []))
		if not is_entry:
			preloads.append(chunk["file"])
		for imported in chunk.get("imports", []):
			collect(imported)

	collect(ENTRY, is_entry=True)

	return {
		"script": ASSET_BASE + entry["file"],
		"css": [ASSET_BASE + file for file in dict.fromkeys(css)],
		"preloads": [ASSET_BASE + file for file in preloads],
		"favicon": ASSET_BASE + "favicon.svg",
	}
