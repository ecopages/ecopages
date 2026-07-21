export const DEV_TOOLBAR_SETTINGS_STYLES = `
.eco-dev-toolbar__settings-header {
	margin-bottom: 0;
}

.eco-dev-toolbar__settings-header h2 {
	margin-bottom: 0.25rem;
}

.eco-dev-toolbar__settings-header .eco-dev-toolbar__muted {
	margin: 0;
}

.eco-dev-toolbar__settings-section {
	display: grid;
	gap: 0.55rem;
	padding: 0.7rem;
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 0.6rem;
	background: color-mix(in srgb, var(--eco-dev-toolbar-bg) 88%, transparent);
}

.eco-dev-toolbar__history-section {
	margin-top: 0.85rem;
}

.eco-dev-toolbar__section-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
}

.eco-dev-toolbar__settings-title {
	margin: 0;
	font-size: 0.72rem;
	font-weight: 600;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--eco-dev-toolbar-muted);
}

.eco-dev-toolbar__setting-row {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 0.75rem;
	align-items: center;
	padding: 0.55rem 0;
}

.eco-dev-toolbar__setting-row + .eco-dev-toolbar__setting-row {
	border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.eco-dev-toolbar__setting-copy {
	display: grid;
	gap: 0.15rem;
}

.eco-dev-toolbar__setting-copy strong {
	font-size: 0.82rem;
	font-weight: 600;
}

.eco-dev-toolbar__setting-copy .eco-dev-toolbar__muted {
	margin: 0;
	font-size: 0.72rem;
	line-height: 1.35;
}

.eco-dev-toolbar__select-wrap {
	position: relative;
	display: inline-flex;
	align-items: center;
}

.eco-dev-toolbar__select-wrap::after {
	content: '';
	position: absolute;
	right: 0.65rem;
	width: 0.4rem;
	height: 0.4rem;
	border-right: 1.5px solid var(--eco-dev-toolbar-muted);
	border-bottom: 1.5px solid var(--eco-dev-toolbar-muted);
	transform: rotate(45deg) translateY(-1px);
	pointer-events: none;
}

.eco-dev-toolbar__select {
	appearance: none;
	min-width: 6.5rem;
	padding: 0.42rem 1.8rem 0.42rem 0.65rem;
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-radius: 0.45rem;
	background: rgba(255, 255, 255, 0.04);
	color: var(--eco-dev-toolbar-fg);
	font: inherit;
	font-size: 0.78rem;
	cursor: pointer;
	transition:
		border-color 160ms var(--eco-dev-toolbar-ease),
		background-color 160ms var(--eco-dev-toolbar-ease),
		box-shadow 160ms var(--eco-dev-toolbar-ease);
}

.eco-dev-toolbar__select:hover {
	border-color: rgba(139, 124, 255, 0.45);
	background: rgba(255, 255, 255, 0.06);
}

.eco-dev-toolbar__select:focus {
	outline: none;
	border-color: rgba(139, 124, 255, 0.7);
	box-shadow: 0 0 0 2px rgba(139, 124, 255, 0.2);
}

.eco-dev-toolbar__switch {
	position: relative;
	display: inline-flex;
	align-items: center;
	width: 2.35rem;
	height: 1.35rem;
	flex-shrink: 0;
}

.eco-dev-toolbar__switch input {
	position: absolute;
	inset: 0;
	margin: 0;
	opacity: 0;
	cursor: pointer;
}

.eco-dev-toolbar__switch-track {
	display: block;
	width: 100%;
	height: 100%;
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.14);
	border: 1px solid rgba(255, 255, 255, 0.08);
	transition: background-color 160ms var(--eco-dev-toolbar-ease);
}

.eco-dev-toolbar__switch-track::after {
	content: '';
	position: absolute;
	top: 0.14rem;
	left: 0.14rem;
	width: 0.95rem;
	height: 0.95rem;
	border-radius: 999px;
	background: #f9fafb;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
	transition: transform 160ms var(--eco-dev-toolbar-ease);
}

.eco-dev-toolbar__switch input:checked + .eco-dev-toolbar__switch-track {
	background: color-mix(in srgb, var(--eco-dev-toolbar-accent) 72%, #111827);
	border-color: rgba(139, 124, 255, 0.45);
}

.eco-dev-toolbar__switch input:checked + .eco-dev-toolbar__switch-track::after {
	transform: translateX(1rem);
}

.eco-dev-toolbar__switch input:focus-visible + .eco-dev-toolbar__switch-track {
	box-shadow: 0 0 0 2px rgba(139, 124, 255, 0.25);
}

.eco-dev-toolbar__settings-link {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 0.75rem;
	align-items: center;
	padding: 0.65rem 0.7rem;
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 0.5rem;
	background: rgba(255, 255, 255, 0.03);
	color: inherit;
	text-decoration: none;
	transition:
		border-color 160ms var(--eco-dev-toolbar-ease),
		background-color 160ms var(--eco-dev-toolbar-ease);
}

.eco-dev-toolbar__settings-link:hover {
	border-color: rgba(139, 124, 255, 0.45);
	background: rgba(139, 124, 255, 0.08);
}

.eco-dev-toolbar__settings-link strong {
	display: block;
	font-size: 0.82rem;
	margin-bottom: 0.15rem;
}

.eco-dev-toolbar__settings-link .eco-dev-toolbar__muted {
	margin: 0;
	font-size: 0.72rem;
}

.eco-dev-toolbar__settings-link-icon {
	color: var(--eco-dev-toolbar-accent);
	font-size: 0.9rem;
}
`;
