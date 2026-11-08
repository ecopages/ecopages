/**
 * Tailwind CSS v4 preset for the Lightning CSS Processor
 * @module @ecopages/lightningcss-processor/presets/tailwind-v4
 *
 * Install the peers: pnpm add -D @tailwindcss/node @tailwindcss/oxide tailwindcss
 */

import { resolveProjectImportPath, type StylesheetInvalidation } from '@ecopages/core/processor';
import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import type { Scanner, SourceEntry } from '@tailwindcss/oxide';
import type { LightningCssProcessorPluginConfig } from '../plugin.ts';
import type { LightningCssPreprocessor, PreprocessedStylesheet } from '../preprocessor.ts';
import { withReference } from './tailwind-reference.ts';

/** Options for the Tailwind v4 preset. */
export interface TailwindV4PresetOptions {
	/**
	 * Absolute path to the main Tailwind CSS file containing `@import "tailwindcss"`.
	 * Used to add `@reference` to the CSS files and CSS Modules that use `@apply`.
	 */
	referencePath: string;
}

/** The at-rules that make a stylesheet worth giving to Tailwind. */
const TAILWIND_AT_RULE = /@(?:import|reference|theme|variant|config|plugin|apply|tailwind)\b/u;

/**
 * Tailwind's `Features` and `Polyfills` flags the preset reads.
 *
 * @remarks
 * Tailwind declares them as ambient `const enum`s, which `verbatimModuleSyntax` cannot import, so the values are
 * repeated here and a test pins them to the installed Tailwind.
 */
export const TAILWIND_FLAGS = {
	featuresNone: 0,
	featuresUtilities: 16,
	polyfillsAll: 3,
	polyfillsAtProperty: 1,
} as const;

/** What the preset keeps of a stylesheet Tailwind generated CSS for. */
type StylesheetState = {
	/** The scanner of the content sources, and the sources it was built from; absent when the stylesheet emits no utilities. */
	scanner?: { instance: Scanner; sources: SourceEntry[] };
	/** The class names the last good build generated utilities for. */
	candidates: Set<string>;
	/** Every file the last compile read, such as the Tailwind entry and the `@plugin` modules. */
	dependencies: Set<string>;
};

type TailwindModules = {
	node: typeof import('@tailwindcss/node');
	oxide: typeof import('@tailwindcss/oxide');
};

let modules: Promise<TailwindModules> | undefined;

/**
 * Loads Tailwind on first use.
 *
 * @remarks
 * The peers are optional and the oxide scanner is a native module, so config finalization never loads them.
 */
function loadTailwind(): Promise<TailwindModules> {
	modules ??= Promise.all([import('@tailwindcss/node'), import('@tailwindcss/oxide')])
		.then(([node, oxide]) => ({ node, oxide }))
		.catch((error: unknown) => {
			modules = undefined;
			throw new Error(
				'tailwindV4Preset needs its peers: pnpm add -D @tailwindcss/node @tailwindcss/oxide tailwindcss',
				{ cause: error },
			);
		});
	return modules;
}

/** The content sources a compiled stylesheet scans: the app root unless it says otherwise, plus its `@source`s. */
function scanSources(
	compiler: { root: 'none' | { base: string; pattern: string } | null; sources: SourceEntry[] },
	rootDir: string,
): SourceEntry[] {
	const root =
		compiler.root === 'none'
			? []
			: compiler.root === null
				? [{ base: rootDir, pattern: '**/*', negated: false }]
				: [{ ...compiler.root, negated: false }];
	return [...root, ...compiler.sources];
}

/** Whether `candidates` has a class name `known` lacks. */
function hasNewCandidate(candidates: readonly string[], known: ReadonlySet<string>): boolean {
	return candidates.some((candidate) => !known.has(candidate));
}

/**
 * Rescans the changed files of one stylesheet and tells whether they define a class name its last build lacks.
 *
 * @remarks
 * A changed file the scanner already reads is rescanned alone. A file it has not seen, which matches one of its globs,
 * is a new file, and only a fresh scan knows whether the scanner would read it (it skips ignored and binary files), so
 * the scanner is replaced. A file that is gone or that no glob matches is ignored.
 */
function rescan(
	scanner: NonNullable<StylesheetState['scanner']>,
	candidates: ReadonlySet<string>,
	changed: readonly string[],
	Oxide: typeof Scanner,
): boolean {
	const present = changed.filter((file) => fileSystem.exists(file));
	const read = new Set(scanner.instance.files.map((file) => path.resolve(file)));
	const unseen = present.filter(
		(file) =>
			!read.has(file) &&
			scanner.instance.globs.some(
				({ base, pattern }) =>
					path.isWithin(path.resolve(base), file) &&
					path.matchesGlob(path.relative(path.resolve(base), file), pattern),
			),
	);
	if (unseen.length > 0) {
		scanner.instance = new Oxide({ sources: scanner.sources });
		return hasNewCandidate(scanner.instance.scan(), candidates);
	}
	const known = present.filter((file) => read.has(file));
	if (known.length === 0) return false;
	scanner.instance.scanFiles(known.map((file) => ({ file, extension: path.extname(file).slice(1) })));
	return hasNewCandidate(scanner.instance.scan(), candidates);
}

/**
 * Runs Tailwind v4 over each stylesheet before Lightning CSS, without PostCSS.
 *
 * @remarks
 * Each stylesheet is compiled once and built for the class names oxide scans in the app. Scanning is per stylesheet,
 * since each can declare its own `@source`s, and the scanner is kept so a change to a template rescans only that file.
 */
function createTailwindPreprocessor(options: TailwindV4PresetOptions): LightningCssPreprocessor {
	const referencePath = path.resolve(options.referencePath);
	const stylesheets = new Map<string, StylesheetState>();

	return {
		async transform(css, file, context): Promise<PreprocessedStylesheet> {
			const entry = path.resolve(file);
			const source = withReference(css, entry, referencePath);
			if (!TAILWIND_AT_RULE.test(source)) {
				stylesheets.delete(entry);
				return { css };
			}
			const { node, oxide } = await loadTailwind();
			const state = stylesheets.get(entry) ?? { candidates: new Set<string>(), dependencies: new Set<string>() };
			stylesheets.set(entry, state);
			const dependencies = new Set<string>();
			try {
				const compiler = await node.compile(source, {
					base: path.dirname(entry),
					from: entry,
					shouldRewriteUrls: true,
					polyfills: entry.endsWith('.module.css')
						? TAILWIND_FLAGS.polyfillsAll ^ TAILWIND_FLAGS.polyfillsAtProperty
						: TAILWIND_FLAGS.polyfillsAll,
					onDependency: (dependency) => dependencies.add(path.resolve(dependency)),
					customCssResolver: async (id, base) => {
						if (id.startsWith('.')) return undefined;
						const aliased = resolveProjectImportPath(context.rootDir, path.join(base, 'index.css'), id);
						return aliased && fileSystem.exists(aliased) ? aliased : undefined;
					},
				});
				state.dependencies = dependencies;
				if (compiler.features === TAILWIND_FLAGS.featuresNone) {
					stylesheets.delete(entry);
					return { css, dependencies: [...dependencies] };
				}
				let candidates: string[] = [];
				if (compiler.features & TAILWIND_FLAGS.featuresUtilities) {
					const sources = scanSources(compiler, context.rootDir);
					if (JSON.stringify(state.scanner?.sources) !== JSON.stringify(sources)) {
						state.scanner = { instance: new oxide.Scanner({ sources }), sources };
					}
					candidates = state.scanner!.instance.scan();
				} else {
					state.scanner = undefined;
				}
				const built = compiler.build(candidates);
				state.candidates = new Set(candidates);
				return { css: built, dependencies: [...dependencies] };
			} catch (error) {
				state.dependencies = new Set([...state.dependencies, ...dependencies]);
				throw error;
			}
		},

		async invalidate(files): Promise<StylesheetInvalidation> {
			const changed = files.map((file) => path.resolve(file));
			const { oxide } = await loadTailwind();
			const stale: string[] = [];
			for (const [entry, state] of stylesheets) {
				if (changed.some((file) => state.dependencies.has(file) && !file.endsWith('.css'))) {
					stale.push(entry);
				} else if (state.scanner && rescan(state.scanner, state.candidates, changed, oxide.Scanner)) {
					stale.push(entry);
				}
			}
			return stale;
		},
	};
}

/**
 * Creates a Lightning CSS Processor config preset for Tailwind CSS v4.
 *
 * Tailwind runs inside the Processor, so the app needs no PostCSS. Each stylesheet goes through Tailwind, then through
 * the Processor's own Lightning CSS steps: bundling, `targets`, minifying and CSS Modules. Stylesheets that use
 * `@apply`, and CSS Modules, get an `@reference` to `referencePath` so the app's theme applies.
 *
 * @example
 * ```typescript
 * import { lightningCssProcessorPlugin } from '@ecopages/lightningcss-processor';
 * import { tailwindV4Preset } from '@ecopages/lightningcss-processor/presets/tailwind-v4';
 *
 * lightningCssProcessorPlugin({
 *   ...tailwindV4Preset({ referencePath: path.resolve(import.meta.dirname, 'src/styles/tailwind.css') }),
 *   targets: ['chrome >= 111'],
 * })
 * ```
 */
export function tailwindV4Preset(options: TailwindV4PresetOptions): LightningCssProcessorPluginConfig {
	return { preprocessor: createTailwindPreprocessor(options) };
}
