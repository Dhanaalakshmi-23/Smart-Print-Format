// Copyright (c) 2026, Dhanaa Lakshmi and contributors
// For license information, please see license.txt

frappe.ui.form.on("Smart Print Format", {
	refresh(frm) {
		if (frm.is_new()) return;

		frm.add_custom_button(__("Open Builder"), () => {
			window.open(`/smart-print/designer/${encodeURIComponent(frm.doc.name)}`, "_blank");
		});

		if (frm.doc.print_format && frm.doc.status === "Active") {
			frm.add_custom_button(__("Print Format"), () => {
				frappe.set_route("Form", "Print Format", frm.doc.print_format);
			});
		}

		if (frm.doc.status !== "Archived" && frm.perm[0]?.write) {
			frm.add_custom_button(__("Publish"), () => {
				frappe.confirm(__("Publish this Smart Print Format?"), () => {
					frappe
						.call({
							method: "smart_print_format.api.publish_print_format",
							args: { name: frm.doc.name },
							freeze: true,
						})
						.then(() => {
							frappe.show_alert({ message: __("Published"), indicator: "green" });
							frm.reload_doc();
						});
				});
			});
		}
	},

	status(frm) {
		if (frm.doc.status === "Active") {
			frm.set_value("is_active", 1);
		} else if (frm.doc.status === "Archived") {
			frm.set_value("is_active", 0);
		}
	},

	is_active(frm) {
		if (frm.doc.is_active) {
			frm.set_value("status", "Active");
		}
	},
});
