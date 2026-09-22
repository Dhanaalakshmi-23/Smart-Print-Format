// Copyright (c) 2026, Dhanaa Lakshmi and contributors
// For license information, please see license.txt

frappe.ui.form.on("Smart Print Format", {
    refresh(frm) {
        if (frm.is_new()) return;

        frm.add_custom_button("Open Builder", () => {
            frappe.msgprint("Smart Print Format Builder will open here.");
        });

        frm.add_custom_button("Preview", () => {
            frappe.msgprint("Print preview will open here.");
        });

        if (frm.doc.status === "Draft") {
            frm.add_custom_button("Publish", () => {
                frappe.confirm(
                    "Publish this Smart Print Format?",
                    () => {
                        frappe.show_alert({
                            message: "Publish action will be connected to the backend.",
                            indicator: "green"
                        });
                    }
                );
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
    }
});
