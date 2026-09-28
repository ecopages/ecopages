import { styleText } from 'node:util';

/**
 * Terminal mark rasterized from `assets/brand/logo-on-light.svg`.
 * @remarks Half-blocks keep rows flush; a thin stroke leaves the spiral's inner gaps open.
 */
const BRAND_MARK_LINES = [
	'                ▄▄▄▄',
	'        ▄▄▄▄█▀▀▀▀▄█',
	'    ▄▄▀▀▀        ██',
	' ▄█▀      ▄▄▄▄   █',
	'▄█       █▀  ██  █',
	'█▄  ▀█▄ ██  ▄█  ██',
	' █▄   ▀▀██▀▀▀   █',
	'  ▀▀█▄  ▀█    ▄█▀',
	'  ▄█▀     ▀▀▀▀▀',
	' █▀',
	'▀',
];

export function formatBrandBanner(version, stream = process.stdout) {
	const markWidth = Math.max(...BRAND_MARK_LINES.map((line) => [...line].length));
	const versionLabel = stream.hasColors?.() ? styleText('dim', version) : version;
	const labels = ['ecopages', versionLabel];
	const labelStart = Math.max(0, Math.floor((BRAND_MARK_LINES.length - labels.length) / 2));

	return BRAND_MARK_LINES.map((line, index) => {
		const padded = `${line}${' '.repeat(markWidth - [...line].length)}`;
		const label = labels[index - labelStart];
		return label === undefined ? padded : `${padded}  ${label}`;
	}).join('\n');
}

export function withBrandBanner(version, text) {
	if (!process.stdout.isTTY) return text;
	return `${formatBrandBanner(version)}\n\n${text}`;
}

export function printBrandBanner(version) {
	if (!process.stderr.isTTY) return;
	process.stderr.write(`${formatBrandBanner(version, process.stderr)}\n\n`);
}
