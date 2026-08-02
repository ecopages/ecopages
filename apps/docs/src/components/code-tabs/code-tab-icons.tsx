import type { JsxRenderable } from '@ecopages/jsx';

export type CodeTabIconKind = 'bun' | 'pnpm' | 'npm' | 'typescript';

type TabIconSource = {
	id: string;
	label: string;
	code?: string;
};

const PACKAGE_MANAGER_IDS = new Set<CodeTabIconKind>(['bun', 'pnpm', 'npm']);

/** Simple Icons paths (CC0) — https://simpleicons.org */
const BUN_PATH =
	'M12 22.596c6.628 0 12-4.338 12-9.688 0-3.318-2.057-6.248-5.219-7.986-1.286-.715-2.297-1.357-3.139-1.89C14.058 2.025 13.08 1.404 12 1.404c-1.097 0-2.334.785-3.966 1.821a49.92 49.92 0 0 1-2.816 1.697C2.057 6.66 0 9.59 0 12.908c0 5.35 5.372 9.687 12 9.687v.001ZM10.599 4.715c.334-.759.503-1.58.498-2.409 0-.145.202-.187.23-.029.658 2.783-.902 4.162-2.057 4.624-.124.048-.199-.121-.103-.209a5.763 5.763 0 0 0 1.432-1.977Zm2.058-.102a5.82 5.82 0 0 0-.782-2.306v-.016c-.069-.123.086-.263.185-.172 1.962 2.111 1.307 4.067.556 5.051-.082.103-.23-.003-.189-.126a5.85 5.85 0 0 0 .23-2.431Zm1.776-.561a5.727 5.727 0 0 0-1.612-1.806v-.014c-.112-.085-.024-.274.114-.218 2.595 1.087 2.774 3.18 2.459 4.407a.116.116 0 0 1-.049.071.11.11 0 0 1-.153-.026.122.122 0 0 1-.022-.083 5.891 5.891 0 0 0-.737-2.331Zm-5.087.561c-.617.546-1.282.76-2.063 1-.117 0-.195-.078-.156-.181 1.752-.909 2.376-1.649 2.999-2.778 0 0 .155-.118.188.085 0 .304-.349 1.329-.968 1.874Zm4.945 11.237a2.957 2.957 0 0 1-.937 1.553c-.346.346-.8.565-1.286.62a2.178 2.178 0 0 1-1.327-.62 2.955 2.955 0 0 1-.925-1.553.244.244 0 0 1 .064-.198.234.234 0 0 1 .193-.069h3.965a.226.226 0 0 1 .19.07c.05.053.073.125.063.197Zm-5.458-2.176a1.862 1.862 0 0 1-2.384-.245 1.98 1.98 0 0 1-.233-2.447c.207-.319.503-.566.848-.713a1.84 1.84 0 0 1 1.092-.11c.366.075.703.261.967.531a1.98 1.98 0 0 1 .408 2.114 1.931 1.931 0 0 1-.698.869v.001Zm8.495.005a1.86 1.86 0 0 1-2.381-.253 1.964 1.964 0 0 1-.547-1.366c0-.384.11-.76.32-1.079.207-.319.503-.567.849-.713a1.844 1.844 0 0 1 1.093-.108c.367.076.704.262.968.534a1.98 1.98 0 0 1 .4 2.117 1.932 1.932 0 0 1-.702.868Z';

const PNPM_PATH =
	'M0 0v7.5h7.5V0zm8.25 0v7.5h7.498V0zm8.25 0v7.5H24V0zM8.25 8.25v7.5h7.498v-7.5zm8.25 0v7.5H24v-7.5zM0 16.5V24h7.5v-7.5zm8.25 0V24h7.498v-7.5zm8.25 0V24H24v-7.5z';

const NPM_PATH =
	'M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z';

const TYPESCRIPT_PATH =
	'M1.125 0C.502 0 0 .502 0 1.125v21.75C0 23.498.502 24 1.125 24h21.75c.623 0 1.125-.502 1.125-1.125V1.125C24 .502 23.498 0 22.875 0zm17.363 9.75c.612 0 1.154.037 1.627.111a6.38 6.38 0 0 1 1.306.34v2.458a3.95 3.95 0 0 0-.643-.361 5.093 5.093 0 0 0-.717-.26 5.453 5.453 0 0 0-1.426-.2c-.3 0-.573.028-.819.086a2.1 2.1 0 0 0-.623.242c-.17.104-.3.229-.393.374a.888.888 0 0 0-.14.49c0 .196.053.373.156.529.104.156.252.304.443.444s.423.276.696.41c.273.135.582.274.926.416.47.197.892.407 1.266.628.374.222.695.473.963.753.268.279.472.598.614.957.142.359.214.776.214 1.253 0 .657-.125 1.21-.373 1.656a3.033 3.033 0 0 1-1.012 1.085 4.38 4.38 0 0 1-1.487.596c-.566.12-1.163.18-1.79.18a9.916 9.916 0 0 1-1.84-.164 5.544 5.544 0 0 1-1.512-.493v-2.63a5.033 5.033 0 0 0 3.237 1.2c.333 0 .624-.03.872-.09.249-.06.456-.144.623-.25.166-.108.29-.234.373-.38a1.023 1.023 0 0 0-.074-1.089 2.12 2.12 0 0 0-.537-.5 5.597 5.597 0 0 0-.807-.444 27.72 27.72 0 0 0-1.007-.436c-.918-.383-1.602-.852-2.053-1.405-.45-.553-.676-1.222-.676-2.005 0-.614.123-1.141.369-1.582.246-.441.58-.804 1.004-1.089a4.494 4.494 0 0 1 1.47-.629 7.536 7.536 0 0 1 1.77-.201zm-15.113.188h9.563v2.166H9.506v9.646H6.789v-9.646H3.375z';

/**
 * Resolves a tab icon from id, label, or install-command prefix.
 */
export function resolveTabIconKind(tab: TabIconSource): CodeTabIconKind | null {
	const id = tab.id.trim().toLowerCase();
	if (PACKAGE_MANAGER_IDS.has(id as CodeTabIconKind)) {
		return id as CodeTabIconKind;
	}

	const label = tab.label.trim().toLowerCase();
	if (PACKAGE_MANAGER_IDS.has(label as CodeTabIconKind)) {
		return label as CodeTabIconKind;
	}

	if (/\.tsx?$/i.test(tab.label.trim())) {
		return 'typescript';
	}

	const code = typeof tab.code === 'string' ? tab.code.trim().toLowerCase() : '';
	if (code.startsWith('bun ')) return 'bun';
	if (code.startsWith('pnpm ')) return 'pnpm';
	if (code.startsWith('npm ')) return 'npm';

	return null;
}

function BrandIcon({ path, color }: { path: string; color: string }): JsxRenderable {
	return (
		<svg class="code-tabs__tab-icon code-tabs__tab-icon--brand" viewBox="0 0 24 24" aria-hidden="true">
			<path fill={color} d={path} />
		</svg>
	);
}

function TypeScriptIcon(): JsxRenderable {
	return (
		<svg
			class="code-tabs__tab-icon code-tabs__tab-icon--mono"
			viewBox="0 0 24 24"
			aria-hidden="true"
			fill="currentColor"
		>
			<path d={TYPESCRIPT_PATH} />
		</svg>
	);
}

export function CodeTabIcon({ kind }: { kind: CodeTabIconKind }): JsxRenderable {
	switch (kind) {
		case 'typescript':
			return <TypeScriptIcon />;
		case 'bun':
			return <BrandIcon path={BUN_PATH} color="currentColor" />;
		case 'pnpm':
			return <BrandIcon path={PNPM_PATH} color="#f9ad00" />;
		case 'npm':
			return <BrandIcon path={NPM_PATH} color="#cb3837" />;
	}
}

export function renderTabLabel(tab: TabIconSource): JsxRenderable {
	const iconKind = resolveTabIconKind(tab);

	if (!iconKind) {
		return tab.label;
	}

	return (
		<span class="code-tabs__tab-label">
			<CodeTabIcon kind={iconKind} />
			<span class="code-tabs__tab-text">{tab.label}</span>
		</span>
	);
}
