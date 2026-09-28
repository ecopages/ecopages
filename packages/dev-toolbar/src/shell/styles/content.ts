export const DEV_TOOLBAR_CONTENT_STYLES = `
.eco-dev-toolbar__panel {
	padding: 0.95rem 1rem 1.05rem;
	display: grid;
	gap: 1rem;
}

.eco-dev-toolbar__panel h2 {
	margin: 0 0 0.5rem;
	font-size: 0.92rem;
	font-weight: 600;
	letter-spacing: 0.01em;
}

.eco-dev-toolbar__muted {
	color: var(--eco-dev-toolbar-muted);
	margin: 0;
}

.eco-dev-toolbar__docs-link {
	color: var(--eco-dev-toolbar-accent);
	text-decoration: none;
}

.eco-dev-toolbar__docs-link:hover {
	text-decoration: underline;
}

.eco-dev-toolbar__warning {
	color: var(--eco-dev-toolbar-warning);
	margin-top: 0.25rem;
}

.eco-dev-toolbar__kv {
	display: grid;
	gap: 0.45rem;
	margin: 0;
}

.eco-dev-toolbar__kv > div {
	display: grid;
	grid-template-columns: 6rem 1fr;
	gap: 0.5rem;
}

.eco-dev-toolbar__kv dt {
	margin: 0;
	color: var(--eco-dev-toolbar-muted);
}

.eco-dev-toolbar__kv dd {
	margin: 0;
	word-break: break-word;
}

.eco-dev-toolbar__mono {
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	font-size: 0.72rem;
	word-break: break-all;
}

.eco-dev-toolbar__table-wrap {
	overflow: auto;
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 0.55rem;
}

.eco-dev-toolbar__table {
	width: 100%;
	border-collapse: collapse;
	font-size: 0.72rem;
}

.eco-dev-toolbar__table th,
.eco-dev-toolbar__table td {
	padding: 0.45rem 0.55rem;
	text-align: left;
	border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	vertical-align: top;
}

.eco-dev-toolbar__table th {
	color: var(--eco-dev-toolbar-muted);
	font-weight: 600;
}

.eco-dev-toolbar__table tbody tr:last-child td {
	border-bottom: 0;
}

.eco-dev-toolbar__list {
	list-style: none;
	padding: 0;
	margin: 0;
	display: grid;
	gap: 0.65rem;
}

.eco-dev-toolbar__link {
	border: 0;
	background: transparent;
	color: inherit;
	padding: 0;
	text-align: left;
	cursor: pointer;
}

.eco-dev-toolbar__list-entry {
	display: grid;
	gap: 0.45rem;
}

.eco-dev-toolbar__issue-pagination {
	padding: 0 0.15rem 0.1rem;
}

.eco-dev-toolbar__list-item {
	display: grid;
	gap: 0.2rem;
	width: 100%;
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 0.5rem;
	background: color-mix(in srgb, var(--eco-dev-toolbar-bg) 92%, transparent);
	color: inherit;
	padding: 0.55rem 0.65rem;
	text-align: left;
	cursor: pointer;
	transition: border-color 160ms var(--eco-dev-toolbar-ease);
}

.eco-dev-toolbar__dom-highlight[data-eco-dev-toolbar-highlight='a11y'] {
	outline: 2px solid #ff5c7a !important;
	outline-offset: 2px;
}

.eco-dev-toolbar__dom-highlight[data-eco-dev-toolbar-highlight='island'] {
	outline: 2px solid #7c5cff !important;
	outline-offset: 2px;
}

.eco-dev-toolbar__list-item:hover,
.eco-dev-toolbar__list-item[data-highlighted='true'] {
	border-color: rgba(139, 124, 255, 0.55);
}

.eco-dev-toolbar__pagination {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
}

.eco-dev-toolbar__pagination-copy {
	margin: 0;
	font-size: 0.72rem;
	color: var(--eco-dev-toolbar-muted);
}

.eco-dev-toolbar__pagination-actions {
	display: inline-flex;
	gap: 0.35rem;
}

.eco-dev-toolbar__pagination-button {
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-radius: 0.45rem;
	background: color-mix(in srgb, var(--eco-dev-toolbar-bg) 92%, transparent);
	color: var(--eco-dev-toolbar-fg);
	font: inherit;
	font-size: 0.72rem;
	padding: 0.28rem 0.55rem;
	cursor: pointer;
}

.eco-dev-toolbar__pagination-button:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}

.eco-dev-toolbar__status-pill {
	display: inline-flex;
	align-items: center;
	border-radius: 999px;
	padding: 0.1rem 0.45rem;
	font-size: 0.68rem;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.eco-dev-toolbar__status-pill[data-status='aborted'] {
	background: rgba(245, 158, 11, 0.16);
	color: var(--eco-dev-toolbar-warning);
}

.eco-dev-toolbar__list-item strong {
	font-size: 0.82rem;
}

.eco-dev-toolbar__list-item .eco-dev-toolbar__muted,
.eco-dev-toolbar__list-item .eco-dev-toolbar__mono {
	display: block;
}

.eco-dev-toolbar__field {
	display: grid;
	gap: 0.35rem;
}

`;
