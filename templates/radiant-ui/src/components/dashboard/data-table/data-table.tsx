/**
 * Dashboard inventory table — Radiant UI data-table story, in-memory.
 *
 * Nested table, pagination, dialog, form, and select hosts are stamped by the
 * custom element, so this module owns their stylesheets and the host script.
 * Listing `Table` as a component would attach that script to a root that never
 * renders.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import './data-table.script';

export const DataTable = eco.component<Record<string, never>, JsxRenderable>({
	dependencies: {
		stylesheets: [
			'../../ui/primitives.css',
			'../../ui/button/button.css',
			'../../ui/input/input.css',
			'../../ui/input-group/input-group.css',
			'../../ui/label/label.css',
			'../../ui/checkbox/checkbox.css',
			'../../ui/spinner/spinner.css',
			'../../ui/table/table.css',
			'../../ui/pagination/pagination.css',
			'../../ui/select/select.css',
			'../../ui/listbox/listbox.css',
			'../../ui/tag-group/tag-group.css',
			'../../ui/menu-button/menu-button.css',
			'../../ui/popover/popover.css',
			'../../ui/dialog/dialog.css',
			'../../ui/form/form.css',
			'../../ui/field/field.css',
			'./data-table.css',
		],
		scripts: [{ src: './data-table.script.tsx', lazy: { 'on:visible': true } }],
	},
	render: () => <dashboard-data-table />,
});
