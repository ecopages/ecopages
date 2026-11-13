const paths = {
	sidebar: 'M6 2.75v10.5M3 2.75h10c.55 0 1 .45 1 1v8.5c0 .55-.45 1-1 1H3c-.55 0-1-.45-1-1v-8.5c0-.55.45-1 1-1Z',
	dashboard: 'M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z',
	account: 'M10.5 5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM3.25 13.5v-.75a4.75 4.75 0 0 1 9.5 0v.75',
	back: 'M7.5 3.5 3 8l4.5 4.5M3 8h10',
	forward: 'm8.5 3.5 4.5 4.5-4.5 4.5M3 8h10',
	minimize: 'M4 8h8',
	maximize: 'M4 4h8v8H4z',
	close: 'm4.5 4.5 7 7m0-7-7 7',
};

export function ShellIcon({ name }: { name: keyof typeof paths }) {
	return (
		<svg
			class="shell-icon"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			stroke-width="1.25"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d={paths[name]} />
		</svg>
	);
}
