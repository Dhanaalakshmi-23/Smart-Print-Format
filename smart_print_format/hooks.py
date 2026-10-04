app_name = "smart_print_format"
app_title = "Smart Print Format"
app_publisher = "Dhanaa Lakshmi"
app_description = "Intelligent design layer on top of frappe's existing infrastructure with a better interactive UI and structured workflow"
app_email = "dhanaalakshminarayanan@gmail.com"
app_license = "mit"

website_route_rules = [
	{"from_route": "/smart-print/<path:app_path>", "to_route": "smart-print"},
]

before_install = "smart_print_format.install.ensure_role"
after_install = "smart_print_format.install.after_install"
before_migrate = "smart_print_format.install.ensure_role"

fixtures = [
	{"dt": "Role", "filters": [["name", "=", "Smart Print Manager"]]},
	{"dt": "Smart Print Format Component Type"},
	{"dt": "Smart Print Format Component"},
]
