import frappe

ROLE = "Smart Print Manager"


def ensure_role():
	"""Create the Smart Print Manager role if it's missing."""
	if frappe.db.exists("Role", ROLE):
		return
	frappe.get_doc({"doctype": "Role", "role_name": ROLE, "desk_access": 1}).insert(ignore_permissions=True)


def after_install():
	grant_print_format_access()


def grant_print_format_access():
	"""Let Smart Print Managers read and write Print Formats, which publishing needs."""
	from frappe.permissions import add_permission, update_permission_property

	if frappe.db.exists("Custom DocPerm", {"parent": "Print Format", "role": ROLE, "permlevel": 0}):
		return
	add_permission("Print Format", ROLE, 0, "read")
	for ptype in ("write", "create"):
		update_permission_property("Print Format", ROLE, 0, ptype, 1)
