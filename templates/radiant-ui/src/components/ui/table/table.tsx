/**
 * Table — `@ecopages/radiant-ui/table`.
 *
 * `Table` owns this component's stylesheet and lazy script, so listing it in a
 * page or layout `dependencies.components` ships everything it needs.
 *
 * This is a `role="grid"` built from divs, so every part is explicit: a header
 * of columns, a body of rows, a cell per column per row, and — when rows are
 * selectable — a selection cell at the head of the header row and of every row.
 * Rendering data by hand means keeping column order and cell order in sync.
 *
 * Pass `columns` and `rows` and the cells are laid out from the column ids. The
 * first column becomes the row header unless another sets `isRowHeader`.
 */
import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import {
	RuiTable,
	RuiTableBody,
	RuiTableCell,
	RuiTableColumn,
	RuiTableEmptyState,
	RuiTableHeader,
	RuiTableRow,
	RuiTableSelectionCell,
	type RuiTableElement,
	type RuiTableProps,
} from '@ecopages/radiant-ui/table';

export type TableColumn = {
	id: string;
	label: JsxRenderable;
	allowsSorting?: boolean;
	/** Marks this column's cells as the row's accessible name. */
	isRowHeader?: boolean;
};

export type TableRow = {
	id: string;
	/** Cell content keyed by column id. */
	cells: Record<string, JsxRenderable>;
	disabled?: boolean;
	actionable?: boolean;
};

export type TableProps = JsxCustomElementAttributes<RuiTableElement, RuiTableProps> & {
	columns?: TableColumn[];
	rows?: TableRow[];
	/** Shown in place of the body when `rows` is empty. */
	emptyMessage?: JsxRenderable;
	children?: JsxRenderable;
};

export const Table = eco.component<TableProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./table.css'],
		scripts: [{ src: './table.script.ts', lazy: { 'on:visible': true } }],
	},
	render: ({ columns, rows, emptyMessage = 'No results', children, selectionMode, ...props }) => {
		if (!columns) {
			return (
				<RuiTable {...props} selectionMode={selectionMode}>
					{children}
				</RuiTable>
			);
		}

		const selectable = selectionMode === 'single' || selectionMode === 'multiple';
		const rowHeaderId = (columns.find((column) => column.isRowHeader) ?? columns[0])?.id;
		const entries = rows ?? [];

		return (
			<RuiTable {...props} selectionMode={selectionMode}>
				<RuiTableHeader>
					<RuiTableRow id="header">
						{selectable ? <RuiTableSelectionCell scope="all" /> : null}
						{columns.map((column) => (
							<RuiTableColumn
								id={column.id}
								allowsSorting={column.allowsSorting}
								isRowHeader={column.id === rowHeaderId}
							>
								{column.label}
							</RuiTableColumn>
						))}
					</RuiTableRow>
				</RuiTableHeader>
				<RuiTableBody>
					{entries.length === 0 ? (
						<RuiTableEmptyState colSpan={columns.length + (selectable ? 1 : 0)}>
							{emptyMessage}
						</RuiTableEmptyState>
					) : (
						entries.map((row) => (
							<RuiTableRow id={row.id} disabled={row.disabled} actionable={row.actionable}>
								{selectable ? <RuiTableSelectionCell scope="row" /> : null}
								{columns.map((column) => (
									<RuiTableCell isRowHeader={column.id === rowHeaderId}>
										{row.cells[column.id]}
									</RuiTableCell>
								))}
							</RuiTableRow>
						))
					)}
				</RuiTableBody>
			</RuiTable>
		);
	},
});
