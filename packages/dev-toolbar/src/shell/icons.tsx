/** @jsxImportSource @ecopages/jsx */

const SVG_PROPS = {
	xmlns: 'http://www.w3.org/2000/svg',
	width: 15,
	height: 15,
	viewBox: '0 0 16 16',
	fill: 'none',
	stroke: 'currentColor',
	'stroke-width': 1.5,
	'stroke-linecap': 'round',
	'stroke-linejoin': 'round',
	'aria-hidden': true,
} as const;

export function NavigationIcon({ loading = false }: { loading?: boolean }) {
	return (
		<svg {...SVG_PROPS}>
			{loading ? (
				<path d="M8 2.5a5.5 5.5 0 1 1 0 11" class="eco-dev-toolbar__spinner-arc" />
			) : (
				<>
					<circle cx="4.25" cy="8" r="1.5" />
					<path d="M6 8h5.5" />
					<path d="m10.5 5.5 2.5 2.5-2.5 2.5" />
				</>
			)}
		</svg>
	);
}

export function DepsIcon() {
	return (
		<svg {...SVG_PROPS}>
			<path d="M8 2.25 2.75 5.25 8 8.25l5.25-3-5.25-3Z" />
			<path d="m2.75 8.25 5.25 3 5.25-3" />
			<path d="m2.75 11.25 5.25 3 5.25-3" />
		</svg>
	);
}

export function IslandsIcon() {
	return (
		<svg {...SVG_PROPS}>
			<rect x="2.25" y="2.25" width="5.25" height="5.25" rx="1" />
			<rect x="8.5" y="8.5" width="5.25" height="5.25" rx="1" />
			<path d="M7.5 5h1.75M5 7.5v1.75" />
		</svg>
	);
}

export function A11yIcon() {
	return (
		<svg {...SVG_PROPS}>
			<circle cx="8" cy="3.75" r="1.25" />
			<path d="M5.25 6.75h5.5" />
			<path d="M6.25 6.75 5 12.75" />
			<path d="M9.75 6.75 11 12.75" />
			<path d="M7 10.25h2" />
		</svg>
	);
}

export function SettingsIcon() {
	return (
		<svg {...SVG_PROPS}>
			<path d="M2.25 5.25h11.5" />
			<path d="M2.25 10.75h11.5" />
			<circle cx="5.25" cy="5.25" r="1.25" />
			<circle cx="10.75" cy="10.75" r="1.25" />
		</svg>
	);
}
