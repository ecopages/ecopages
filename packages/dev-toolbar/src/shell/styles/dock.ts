export const DEV_TOOLBAR_DOCK_STYLES = `
.eco-dev-toolbar__shell {
	position: relative;
	z-index: 2;
	transition:
		transform 320ms var(--eco-dev-toolbar-ease),
		opacity 320ms var(--eco-dev-toolbar-ease);
	transform: none;
	opacity: 1;
	will-change: transform, opacity;
	pointer-events: none;
}

.eco-dev-toolbar__shell .eco-dev-toolbar__dock {
	pointer-events: auto;
}

.eco-dev-toolbar__shell[data-motion='active'] {
	transition: none !important;
}

.eco-dev-toolbar__shell[data-stealth-phase='dwell']:not([data-open='true']),
.eco-dev-toolbar__shell[data-stealth-phase='fade']:not([data-open='true']) {
	transform: none;
	opacity: 1;
}

.eco-dev-toolbar__shell[data-stealth-phase='fade']:not([data-open='true']) .eco-dev-toolbar__dock {
	opacity: 0.38;
	transition: opacity 4s linear;
}

.eco-dev-toolbar__shell[data-stealth-phase='dwell']:not([data-open='true']) .eco-dev-toolbar__dock {
	opacity: 1;
}

.eco-dev-toolbar__shell[data-placement='bottom'][data-stealth='true']:not([data-open='true']) {
	transform: translateY(calc(100% - var(--eco-dev-toolbar-stealth-peek)));
}

.eco-dev-toolbar__shell[data-placement='top'][data-stealth='true']:not([data-open='true']) {
	transform: translateY(calc(-100% + var(--eco-dev-toolbar-stealth-peek)));
}

.eco-dev-toolbar__shell[data-placement='left'][data-stealth='true']:not([data-open='true']) {
	transform: translateX(calc(-100% + var(--eco-dev-toolbar-stealth-peek)));
}

.eco-dev-toolbar__shell[data-placement='right'][data-stealth='true']:not([data-open='true']) {
	transform: translateX(calc(100% - var(--eco-dev-toolbar-stealth-peek)));
}

.eco-dev-toolbar__shell[data-stealth='true']:not([data-open='true'])::before {
	content: '';
	position: fixed;
	pointer-events: auto;
}

.eco-dev-toolbar__shell[data-placement='bottom'][data-stealth='true']:not([data-open='true'])::before,
.eco-dev-toolbar__shell[data-placement='top'][data-stealth='true']:not([data-open='true'])::before {
	left: 0;
	right: 0;
	height: 3.5rem;
}

.eco-dev-toolbar__shell[data-placement='bottom'][data-stealth='true']:not([data-open='true'])::before {
	bottom: 0;
}

.eco-dev-toolbar__shell[data-placement='top'][data-stealth='true']:not([data-open='true'])::before {
	top: 0;
}

.eco-dev-toolbar__shell[data-placement='left'][data-stealth='true']:not([data-open='true'])::before,
.eco-dev-toolbar__shell[data-placement='right'][data-stealth='true']:not([data-open='true'])::before {
	top: 0;
	bottom: 0;
	width: 3.5rem;
	height: auto;
}

.eco-dev-toolbar__shell[data-placement='left'][data-stealth='true']:not([data-open='true'])::before {
	left: 0;
}

.eco-dev-toolbar__shell[data-placement='right'][data-stealth='true']:not([data-open='true'])::before {
	right: 0;
}

.eco-dev-toolbar__shell[data-open='true'] {
	transform: none;
}

.eco-dev-toolbar__dock {
	display: flex;
	justify-content: center;
	align-items: center;
	gap: 0.15rem;
	padding: 0.28rem;
	border-radius: var(--eco-dev-toolbar-radius);
	background: color-mix(in srgb, var(--eco-dev-toolbar-bg) 88%, transparent);
	backdrop-filter: blur(14px) saturate(140%);
	-webkit-backdrop-filter: blur(14px) saturate(140%);
	border: 1px solid rgba(255, 255, 255, 0.1);
	box-shadow:
		0 0 0 1px rgba(0, 0, 0, 0.28),
		0 10px 30px rgba(0, 0, 0, 0.38),
		0 2px 8px rgba(0, 0, 0, 0.22);
	opacity: 0.5;
	transition:
		opacity 220ms var(--eco-dev-toolbar-ease),
		box-shadow 220ms var(--eco-dev-toolbar-ease),
		transform 220ms var(--eco-dev-toolbar-ease);
	pointer-events: auto;
}

.eco-dev-toolbar__shell[data-placement='left'] .eco-dev-toolbar__dock,
.eco-dev-toolbar__shell[data-placement='right'] .eco-dev-toolbar__dock {
	flex-direction: column;
}

.eco-dev-toolbar__shell[data-hover='true'] .eco-dev-toolbar__dock,
.eco-dev-toolbar__shell[data-open='true'] .eco-dev-toolbar__dock {
	opacity: 1;
	box-shadow:
		0 0 0 1px rgba(0, 0, 0, 0.32),
		0 14px 36px rgba(0, 0, 0, 0.42),
		0 4px 12px rgba(0, 0, 0, 0.24);
}

.eco-dev-toolbar__button {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1.85rem;
	height: 1.85rem;
	border: 0;
	border-radius: 0.45rem;
	background: transparent;
	color: rgba(243, 244, 246, 0.88);
	cursor: pointer;
	transition:
		background-color 160ms var(--eco-dev-toolbar-ease),
		color 160ms var(--eco-dev-toolbar-ease),
		transform 160ms var(--eco-dev-toolbar-ease);
}

.eco-dev-toolbar__button:hover {
	background: rgba(255, 255, 255, 0.07);
	color: var(--eco-dev-toolbar-fg);
}

.eco-dev-toolbar__button[aria-pressed='true'] {
	background: var(--eco-dev-toolbar-accent-soft);
	color: #ddd6fe;
}

.eco-dev-toolbar__button[data-loading='true'] {
	color: var(--eco-dev-toolbar-accent);
}

.eco-dev-toolbar__button svg {
	display: block;
	flex-shrink: 0;
}

.eco-dev-toolbar__icon-text {
	font-size: 0.78rem;
	font-weight: 600;
	line-height: 1;
}

.eco-dev-toolbar__button[data-loading='true'] svg {
	animation: eco-dev-toolbar-spin 0.75s linear infinite;
}

@keyframes eco-dev-toolbar-spin {
	to {
		transform: rotate(360deg);
	}
}

.eco-dev-toolbar__badge {
	position: absolute;
	top: 0.1rem;
	right: 0.1rem;
	min-width: 0.9rem;
	height: 0.9rem;
	padding: 0 0.15rem;
	border-radius: 0.3rem;
	font-size: 0.58rem;
	font-weight: 700;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	background: var(--eco-dev-toolbar-warning);
	color: #111827;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}

.eco-dev-toolbar__badge[data-severity='error'] {
	background: var(--eco-dev-toolbar-error);
	color: #fff;
}

`;
