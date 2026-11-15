/**
 * The copy and check icons of the code copy button, as data both renderers build from: the rehype plugin as hast and
 * the code tabs as JSX.
 *
 * @remarks
 * `copy-button.css` draws the check by animating `stroke-dashoffset`, which needs the check path to have
 * `pathLength="1"`; keeping the paths here means a change to one renderer cannot break that animation in the other.
 */
export const COPY_ICON_ATTRIBUTES = {
	viewBox: '0 0 24 24',
	width: '16',
	height: '16',
	fill: 'none',
	stroke: 'currentColor',
	'stroke-width': '2',
	'stroke-linecap': 'round',
	'stroke-linejoin': 'round',
	'aria-hidden': 'true',
	focusable: 'false',
} as const;

export const COPY_ICON_SHAPES = {
	copy: [
		{ tag: 'rect', attributes: { x: '9', y: '9', width: '11', height: '11', rx: '2' } },
		{ tag: 'path', attributes: { d: 'M5 15V6a2 2 0 0 1 2-2h9' } },
	],
	check: [{ tag: 'path', attributes: { d: 'M5 12.5l4.5 4.5L19 7.5', pathLength: '1' } }],
} as const;
