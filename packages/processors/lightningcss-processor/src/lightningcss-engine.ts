import { isProductionRuntime, warnStylesheetOnce } from '@ecopages/core/processor';
import { fileSystem } from '@ecopages/file-system';
import { Logger } from '@ecopages/logger';
import browserslist from 'browserslist';
import type { CSSModuleExports, Features, Selector, TransformOptions, Visitor, Warning } from 'lightningcss';

const logger = new Logger('[@ecopages/lightningcss-processor]');

/** The names of the Lightning CSS features `include` and `exclude` accept, such as `Nesting` or `ColorFunction`. */
export type LightningCssFeature = keyof typeof Features;

/**
 * A plugin of the Lightning CSS Processor: a rewrite of the source before Lightning CSS parses it, a visitor, or both.
 *
 * @remarks
 * Plugins run in the order of the `plugins` option, on every stylesheet the Processor bundles: the entry, each
 * imported partial and every CSS Module. A `preprocessor` that reads partials itself, as the Tailwind v4 preset does for
 * the `@import`s it inlines, runs `transformSource` over them too, so a plugin sees them before the preprocessor does.
 * The visitors are composed with Lightning CSS `composeVisitors`, ahead of the Processor's own check
 * for invalid suffix nesting and the app's `visitor`, so a rule a plugin leaves invalid still fails the stylesheet.
 */
export interface LightningCssPlugin {
	/** Names the plugin in errors. */
	name: string;
	/**
	 * Rewrites the source of one stylesheet before Lightning CSS parses it, and before the `preprocessor` runs, so the
	 * CSS it writes can use what the preprocessor handles, such as Tailwind's `@apply`.
	 *
	 * @param css - Stylesheet source.
	 * @param file - Absolute path of the stylesheet.
	 */
	transformSource?(css: string, file: string): string | Promise<string>;
	/** Visits the rules and values of every stylesheet, as the `visitor` option does. */
	visitor?: Visitor<never>;
}

/** The options of the Lightning CSS Processor. */
export interface LightningCssOptions {
	/**
	 * Browserslist queries to lower the CSS for, such as `['chrome >= 90', 'safari >= 15']`.
	 *
	 * @remarks
	 * Unset, the queries come from the app's browserslist config (`.browserslistrc` or the `browserslist` field of
	 * `package.json`, found by browserslist's own lookup from the app root), and nothing is lowered when there is none.
	 * `false` keeps lowering off even when a config exists.
	 */
	targets?: string | readonly string[] | false;
	/**
	 * Whether to minify the CSS.
	 * @default true in production, false otherwise
	 */
	minify?: boolean;
	/** Enables the draft syntax Lightning CSS implements ahead of the specifications, such as custom media queries. */
	drafts?: { customMedia?: boolean };
	/** Enables non-standard syntax, such as the `>>>` and `/deep/` combinators. */
	nonStandard?: { deepSelectorCombinator?: boolean };
	/** Features to compile even when the `targets` support them. */
	include?: readonly LightningCssFeature[];
	/** Features to leave as written even when the `targets` do not support them. */
	exclude?: readonly LightningCssFeature[];
	/** Visits the rules and values of every stylesheet; see the Lightning CSS transforms documentation. */
	visitor?: Visitor<never>;
	/**
	 * Whether a rule Lightning CSS cannot parse is dropped with a warning instead of failing the stylesheet.
	 * @default false
	 */
	errorRecovery?: boolean;
	/** How `*.module.css` stylesheets are scoped. */
	cssModules?: LightningCssModulesOptions;
	/**
	 * Plugins that rewrite the source or visit the rules of every stylesheet, in order, such as `suffixNesting()`.
	 * @default []
	 */
	plugins?: readonly LightningCssPlugin[];
}

/** The options of the CSS Modules Lightning CSS scopes. */
export interface LightningCssModulesOptions {
	/**
	 * How a scoped class name is built, from `[hash]`, `[local]` and `[name]`, which are the hash of the path
	 * relative to the app root, the class name as written and the file name without `.css`, such as `button-module`.
	 * @default '[hash]_[local]'
	 */
	pattern?: string;
}

/** The scoped class name pattern CSS Modules use unless the options set another. */
export const DEFAULT_CSS_MODULES_PATTERN = '[hash]_[local]';

/** A failure that already names every file and position it concerns, which {@link toStylesheetError} leaves as it is. */
export class StylesheetDiagnosticsError extends Error {
	override name = 'StylesheetDiagnosticsError';
}

/**
 * A selector that writes a name straight after `&`: Sass-style suffix nesting such as `&--primary`, or a type selector
 * such as `&div`, which a browser does not accept either.
 */
export type SuffixNestingRule = {
	file: string;
	line: number;
	column: number;
	selector: string;
	kind: 'suffix' | 'type';
};

/** A failure Lightning CSS raised, which names the file and the position. */
type LightningCssError = Error & { fileName?: string; loc?: { line: number; column: number } };

let engine: Promise<typeof import('lightningcss')> | undefined;

/**
 * Loads the native Lightning CSS binding on first use.
 *
 * @remarks
 * Config finalization constructs the Processor but must not load a native module, so a build that never reaches a
 * stylesheet, or a tool that only reads the config, never pays for it.
 */
export function loadLightningCss(): Promise<typeof import('lightningcss')> {
	engine ??= import('lightningcss').catch((error: unknown) => {
		engine = undefined;
		throw error;
	});
	return engine;
}

/**
 * The Lightning CSS `targets` for the `targets` option, or `undefined` to lower nothing.
 *
 * @remarks
 * An explicit option, including an empty one, wins over the config; only an unset option reads the browserslist
 * config of the app at `rootDir`. No default browser set is invented, since Tailwind v4 apps already target modern
 * browsers.
 */
async function resolveTargets(
	queries: LightningCssOptions['targets'],
	rootDir: string,
): Promise<TransformOptions<never>['targets']> {
	if (queries === false) return undefined;
	const configured = queries ?? browserslist.loadConfig({ path: rootDir });
	if (!configured || configured.length === 0) return undefined;
	const { browserslistToTargets } = await loadLightningCss();
	return browserslistToTargets(browserslist(typeof configured === 'string' ? configured : [...configured]));
}

/** Combines feature names into the bit flags Lightning CSS takes. */
async function toFeatureFlags(names: readonly LightningCssFeature[] | undefined): Promise<number | undefined> {
	if (!names || names.length === 0) return undefined;
	const { Features } = await loadLightningCss();
	return names.reduce((flags, name) => flags | Features[name], 0);
}

/** `values` without the keys set to `undefined`. */
function withoutUndefined<T extends object>(values: T): Partial<T> {
	return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<T>;
}

/** What every Lightning CSS call of a Processor shares, resolved once from its options. */
export type ResolvedLightningCssOptions = Pick<
	TransformOptions<never>,
	| 'projectRoot'
	| 'targets'
	| 'minify'
	| 'drafts'
	| 'nonStandard'
	| 'include'
	| 'exclude'
	| 'visitor'
	| 'errorRecovery'
> & {
	/** The `pattern` of the CSS Modules this Processor scopes. */
	cssModulesPattern: string;
	/** The plugins of this Processor, in order. */
	plugins: readonly LightningCssPlugin[];
};

/** The options a Processor resolves to a value when they are unset. */
function resolvedDefaults(options: LightningCssOptions | undefined) {
	return {
		cssModulesPattern: options?.cssModules?.pattern ?? DEFAULT_CSS_MODULES_PATTERN,
		plugins: options?.plugins ?? [],
	};
}

/**
 * Resolves the options of a Processor for an app rooted at `rootDir`.
 *
 * @remarks
 * Unset options are left out, not passed as `undefined`: the native binding rejects an explicit `undefined`. `projectRoot` makes the hashes Lightning CSS derives from a path relative to the app, so they match across machines and folders; it is the real path of `rootDir`, since Lightning CSS reads the real path of each stylesheet.
 */
export async function resolveLightningCssOptions(
	options: LightningCssOptions | undefined,
	rootDir: string,
): Promise<ResolvedLightningCssOptions> {
	return {
		projectRoot: fileSystem.exists(rootDir) ? fileSystem.realpath(rootDir) : rootDir,
		...resolvedDefaults(options),
		minify: options?.minify ?? isProductionRuntime(),
		...withoutUndefined({
			drafts: options?.drafts,
			nonStandard: options?.nonStandard,
			visitor: options?.visitor,
			errorRecovery: options?.errorRecovery,
			targets: await resolveTargets(options?.targets, rootDir),
			include: await toFeatureFlags(options?.include),
			exclude: await toFeatureFlags(options?.exclude),
		}),
	};
}

/**
 * Runs the `transformSource` of each plugin over `css`, in order.
 *
 * @remarks
 * A failure that is not a {@link StylesheetDiagnosticsError} is rethrown naming the plugin, so a plugin author's
 * exception does not surface as a bare message.
 */
export async function transformSourceWithPlugins(
	css: string,
	file: string,
	plugins: readonly LightningCssPlugin[],
): Promise<string> {
	let transformed = css;
	for (const plugin of plugins) {
		if (!plugin.transformSource) continue;
		try {
			transformed = await plugin.transformSource(transformed, file);
		} catch (error) {
			if (error instanceof StylesheetDiagnosticsError) throw error;
			throw new Error(`plugin ${plugin.name}: ${error instanceof Error ? error.message : String(error)}`, {
				cause: error,
			});
		}
	}
	return transformed;
}

/** Logs the warnings of the stylesheet `entry`, once per message until its `source` changes, each with its location. */
export function logWarnings(warnings: readonly Warning[], entry: string, source: string): void {
	for (const { message, loc } of warnings) {
		warnStylesheetOnce(entry, source, `${loc.filename || entry}:${loc.line}:${loc.column} ${message}`, (text) =>
			logger.warn(text),
		);
	}
}

/**
 * Replaces a failure with an error that names the file and, when it has one, the position, keeping the original as its cause.
 *
 * @remarks
 * Only a Lightning CSS failure has a numeric `loc.line` and `loc.column`; Tailwind's `loc` is a tuple and its message already locates the error.
 */
export function toStylesheetError(error: unknown, file: string): Error {
	if (error instanceof StylesheetDiagnosticsError) return error;
	if (!(error instanceof Error)) return new Error(`${file}: ${String(error)}`);
	const { fileName = file, loc, message } = error as LightningCssError;
	return new Error(
		`${fileName}${typeof loc?.line === 'number' && typeof loc.column === 'number' ? `:${loc.line}:${loc.column}` : ''} ${message}`,
		{ cause: error },
	);
}

/**
 * The class map core serves for a CSS Module: each local name, sorted, mapped to its scoped name followed by the
 * scoped names it composes, separated by spaces.
 *
 * @remarks
 * A name composed from the global scope stays as written. Sorting keeps the output the same whichever order the
 * rules were written in.
 */
export function serializeExports(exports: CSSModuleExports): Record<string, string> {
	return Object.fromEntries(
		Object.keys(exports)
			.sort()
			.map((local) => {
				const { name, composes } = exports[local]!;
				return [local, [name, ...composes.map((composed) => composed.name)].join(' ')];
			}),
	);
}

/** Every `&` and the name a selector writes straight after it, such as `&--primary`; empty for valid nesting. */
function suffixNestingOf(selector: Selector): Array<Pick<SuffixNestingRule, 'selector' | 'kind'>> {
	const found: Array<Pick<SuffixNestingRule, 'selector' | 'kind'>> = [];
	for (let index = 0; index < selector.length; index++) {
		const component = selector[index]!;
		const next = selector[index + 1];
		if (component.type === 'nesting' && next?.type === 'type') {
			found.push({ selector: `&${next.name}`, kind: /^[-_]/u.test(next.name) ? 'suffix' : 'type' });
		}
		if (component.type === 'pseudo-class' && 'selectors' in component && component.selectors) {
			for (const inner of component.selectors) {
				if (Array.isArray(inner)) found.push(...suffixNestingOf(inner));
			}
		}
	}
	return found;
}

/**
 * Collects the rules that write Sass-style suffix nesting, such as `.button { &--primary {} }`.
 *
 * @remarks
 * Native CSS nesting cannot concatenate selectors, so `&--primary` is the nesting selector followed by the element
 * `--primary`. Lightning CSS parses it without a warning: it keeps it as written, which a browser drops, or lowers it
 * to `--primary.button`, which matches nothing. Neither reaches the build output as a failure, so the visitor finds
 * the rule at parse time.
 */
export function suffixNestingVisitor(rules: SuffixNestingRule[]): Visitor<never> {
	let sources: readonly string[] = [];
	return {
		StyleSheet(stylesheet) {
			sources = stylesheet.sources;
		},
		Rule: {
			style(rule) {
				const { loc, selectors } = rule.value;
				for (const selector of selectors) {
					for (const found of suffixNestingOf(selector)) {
						rules.push({
							file: sources[loc.source_index] ?? '',
							line: loc.line + 1,
							column: loc.column,
							...found,
						});
					}
				}
			},
		},
	};
}

/** The error for the rules {@link suffixNestingVisitor} collected, one line per selector with its file, line and column. */
export function suffixNestingError(rules: readonly SuffixNestingRule[]): StylesheetDiagnosticsError {
	const lines = rules.map(({ file, line, column, selector, kind }) =>
		kind === 'type'
			? `${file}:${line}:${column} \`${selector}\` puts a type selector after \`&\`, which is not valid CSS; a type selector can only start a compound selector, so write \`${selector.slice(1)}&\`.`
			: `${file}:${line}:${column} \`${selector}\` is Sass-style suffix nesting; native CSS nesting cannot concatenate selectors, so write the full selector explicitly, such as \`.button${selector.slice(1)}\` for \`.button { ${selector} {} }\`, or add the suffixNesting() plugin from @ecopages/lightningcss-processor/plugins/suffix-nesting.`,
	);
	return new StylesheetDiagnosticsError(lines.join('\n'));
}
