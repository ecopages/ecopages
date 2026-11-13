import { copyFile, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const destinationDirectory = resolve(import.meta.dirname, '../src/public/assets/fonts');

/**
 * The docs type: IBM Plex from Fontsource, latin subset. `src/styles/fonts.css` declares the matching `@font-face`
 * rules against `/assets/fonts/`.
 *
 * @remarks
 * The files come from the npm packages instead of being committed. Fontsource's own stylesheets use relative `url()`s
 * that the CSS pipeline inlines without copying the font files, so the files are copied to a public path here.
 */
const faces = [
	{ pkg: '@fontsource/ibm-plex-sans', family: 'ibm-plex-sans', weights: [400, 500, 600, 700] },
	{ pkg: '@fontsource/ibm-plex-mono', family: 'ibm-plex-mono', weights: [400, 500, 600] },
];

await rm(destinationDirectory, { recursive: true, force: true });
await mkdir(destinationDirectory, { recursive: true });

for (const { pkg, family, weights } of faces) {
	const packageRoot = dirname(require.resolve(`${pkg}/package.json`));
	for (const weight of weights) {
		const file = `${family}-latin-${weight}-normal.woff2`;
		await copyFile(resolve(packageRoot, 'files', file), resolve(destinationDirectory, file));
	}
}
