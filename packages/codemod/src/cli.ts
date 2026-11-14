#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Transforms the CLI can run, each described for `--list`.
 */
export const TRANSFORMS = {
	'migrate-data-hooks': 'staticProps and staticPaths of eco.page() to props and paths',
	'migrate-to-eco-page': 'module-level data exports and Page.config to eco.page()',
	'migrate-to-eco-component': 'Component.config assignments to eco.component()',
	'migrate-core-entrypoints': '@ecopages/core imports to the role-based entry points',
} as const;

const USAGE = `Usage: ecopages-codemod <transform> [paths...] [jscodeshift options]

Runs a transform over the given paths (default: src). Pass --dry --print to preview.

Transforms:
${Object.entries(TRANSFORMS)
	.map(([name, description]) => `  ${name.padEnd(28)}${description}`)
	.join('\n')}
`;

/**
 * Runs a transform through the bundled jscodeshift and returns its exit code.
 *
 * @remarks
 * The transform file keeps this module's own extension, so the CLI works both from the published
 * `.js` build and from the `.ts` sources.
 */
export function run(argv: string[]): number {
	const [name, ...rest] = argv;

	if (!name || name === '--help' || name === '-h') {
		process.stdout.write(USAGE);
		return name ? 0 : 1;
	}

	if (name === '--list') {
		process.stdout.write(`${Object.keys(TRANSFORMS).join('\n')}\n`);
		return 0;
	}

	if (!Object.hasOwn(TRANSFORMS, name)) {
		process.stderr.write(`Unknown transform "${name}".\n\n${USAGE}`);
		return 1;
	}

	const transform = fileURLToPath(new URL(`./transforms/${name}${extname(import.meta.url)}`, import.meta.url));
	const jscodeshift = createRequire(import.meta.url).resolve('jscodeshift/bin/jscodeshift.js');
	const hasFlag = (flag: string) => rest.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
	const hasPath = rest.some((arg) => !arg.startsWith('-'));

	const args = [
		jscodeshift,
		'-t',
		transform,
		...(hasFlag('--parser') ? [] : ['--parser', 'tsx']),
		...(hasFlag('--extensions') ? [] : ['--extensions=ts,tsx,js,jsx']),
		...rest,
		...(hasPath ? [] : ['src']),
	];

	return spawnSync(process.execPath, args, { stdio: 'inherit' }).status ?? 1;
}

if (import.meta.main) {
	process.exitCode = run(process.argv.slice(2));
}
