#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPORT_ENV, type MiddlewareReport } from './transforms/migrate-middleware-locals.ts';

/**
 * Transforms the CLI can run, each described for `--list`.
 */
export const TRANSFORMS = {
	'migrate-data-hooks': 'staticProps and staticPaths of eco.page() to props and paths',
	'migrate-to-eco-page': 'module-level data exports and Page.config to eco.page()',
	'migrate-to-eco-component': 'Component.config assignments to eco.component()',
	'migrate-core-entrypoints': '@ecopages/core imports to the role-based entry points',
	'migrate-middleware-locals': 'ctx.locals assignments of middleware to createMiddleware and next({ ... })',
	'migrate-radiant-bindings': 'Radiant $name companion bindings and the bind option to this.$',
	'migrate-radiant-refs': 'Radiant @query options to @ref, @refAll, @query(selector) and @queryAll(selector)',
} as const;

/**
 * Notes printed after a transform runs, for the breaking changes it cannot see in the source.
 */
export const AFTER_RUN_NOTES: Partial<Record<keyof typeof TRANSFORMS, string>> = {
	'migrate-radiant-refs': [
		'NOTE: Radiant ref/query split',
		'',
		'@ref, @refAll, getRef, @onEvent({ ref }) and @bindTo({ ref }) now see only the data-ref parts their own host owns: an outer host no longer gets a nested host part of the same name, and @refAll and getRef(name, true) leave nested parts out. @onEvent({ ref }) no longer fires for a data-ref on the host element itself. This codemod cannot see either case.',
		'',
		'Check each host that renders another Radiant host inside it. Where the outer host read a part of the inner one, use @query(\'[data-ref="name"]\'), @onEvent({ selector }), @bindTo({ selector }) or host.querySelector(...), which still reach into nested hosts. Move a listener on the host element itself off @onEvent({ ref }).',
	].join('\n'),
};

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

	if (name !== 'migrate-middleware-locals') {
		const status = spawnSync(process.execPath, args, { stdio: 'inherit' }).status ?? 1;
		const note = AFTER_RUN_NOTES[name as keyof typeof TRANSFORMS];
		if (note) process.stdout.write(`\n${note}\n`);
		return status;
	}

	const reportDir = mkdtempSync(join(tmpdir(), 'ecopages-codemod-'));
	const reportFile = join(reportDir, 'report.jsonl');
	try {
		const status =
			spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, [REPORT_ENV]: reportFile } })
				.status ?? 1;
		process.stdout.write(`\n${formatMigrationBrief(readReports(reportFile))}\n`);
		return status;
	} finally {
		rmSync(reportDir, { recursive: true, force: true });
	}
}

function readReports(reportFile: string): MiddlewareReport[] {
	try {
		return readFileSync(reportFile, 'utf-8')
			.split('\n')
			.filter(Boolean)
			.map((line) => JSON.parse(line) as MiddlewareReport);
	} catch {
		return [];
	}
}

const DOCS = [
	'core/request-locals',
	'server/define-handlers',
	'server/explicit-routing',
	'server/endpoint-files',
	'reference/typescript',
];

const CATEGORIES: ReadonlyArray<{ kind: MiddlewareReport['kind']; title: string }> = [
	{ kind: 'eco-middleware', title: 'EcoMiddleware<Context> forms' },
	{ kind: 'locals-assignment', title: 'ctx.locals assignments that were not moved' },
	{ kind: 'page-requires', title: 'Pages that declare requires or read locals in render' },
	{ kind: 'request-locals-augmentation', title: 'RequestLocals declarations' },
];

/**
 * Builds the migration brief printed after `migrate-middleware-locals`, written for a person and a coding agent.
 */
export function formatMigrationBrief(reports: readonly MiddlewareReport[]): string {
	const manual = reports.length
		? [...reports]
				.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
				.map((report) => `  ${report.file}:${report.line} ${report.reason}`)
				.join('\n')
		: '  Nothing reported. The codemod rewrites only what it can prove safe, so review the diff and run the type check.';
	const found = CATEGORIES.filter(({ kind }) => reports.some((report) => report.kind === kind)).map(
		({ title }) => title,
	);

	return [
		'MIGRATION BRIEF: middleware locals',
		'',
		'What changed in the API: middleware now provides typed locals through next({ ... }) and reads them through ctx.locals. A stage calls next once, and a plain function that overwrites a local an earlier stage provided throws. Listing the same stage twice in a middleware list is an error. EcoMiddleware<Context> and ctx.require are removed. A page is typed from its middleware list, and its locals are exactly what that list provides: the global RequestLocals interface is removed, so a RequestLocals augmentation of @ecopages/core types nothing. requires is removed and render no longer receives locals: a dynamic page reads them in props and render reads what props returned, which is also sent to the browser: return only the values render needs, never a whole session.',
		'',
		'A migrated middleware is a createMiddleware result, not a function: code in other files that calls it directly, such as a test, has to run it through a middleware list instead.',
		'',
		'A page that read locals in render:',
		"  Before: eco.page({ cache: 'dynamic', middleware: [auth], requires: ['session'], render: ({ locals }) => <h1>{locals.session.user.name}</h1> })",
		"  After:  eco.page({ cache: 'dynamic', middleware: [auth], props: ({ locals }) => ({ user: locals.session.user }), render: ({ user }) => <h1>{user.name}</h1> })",
		'',
		'A shared layout entry that read the global locals:',
		'  Before: { component: Shell, props: ({ locals }: LayoutPropsContext) => ({ user: locals?.session?.user }) }',
		'  After:  { component: Shell, props: ({ locals }: { locals: { session: Session } }) => ({ user: locals.session.user }) }',
		'',
		'Needs manual work:',
		manual,
		'',
		'Docs:',
		...DOCS.map((doc) => `  https://ecopages.app/docs/${doc}`),
		'',
		`Agent prompt: Migrate the Ecopages middleware listed under "Needs manual work"${found.length ? ` (${found.join('; ')})` : ''}. For each ctx.locals assignment that was not moved, restructure the middleware so it has one next() call and passes the values through return next({ key: value }); for each EcoMiddleware<Context> form, replace ctx.field = value with createMiddleware and next({ field }), and read it through ctx.locals.field; for each page that declares requires or reads locals in render, add the middleware that provides the locals to the page middleware list, read them in props and return only the values render reads (locals.session.user as user, never a whole session or user object, since what props returns is sent to the browser), make render read the returned value, and drop requires; replace ctx.require(key, onMissing) with an explicit check of ctx.locals.key that returns the response; for each RequestLocals declaration, make sure a createMiddleware stage provides every local it declared, add that middleware to the list of each page or route that reads them, annotate the locals a shared layout entry reads on its factory parameter (a page that does not list the middleware then fails the type check), and delete the declaration. Follow the Docs list, then run the type check.`,
	].join('\n');
}

if (import.meta.main) {
	process.exitCode = run(process.argv.slice(2));
}
