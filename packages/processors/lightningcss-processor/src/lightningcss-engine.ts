import { isProductionRuntime, warnStylesheetOnce } from '@ecopages/core/processor';
import { fileSystem } from '@ecopages/file-system';
import { Logger } from '@ecopages/logger';
import browserslist from 'browserslist';
import type { CSSModuleExports, Features, TransformOptions, Visitor, Warning } from 'lightningcss';

const logger = new Logger('[@ecopages/lightningcss-processor]');

/** The names of the Lightning CSS features `include` and `exclude` accept, such as `Nesting` or `ColorFunction`. */
export type LightningCssFeature = keyof typeof Features;

/** The options of the Lightning CSS Processor. */
export interface LightningCssOptions {
	/**
	 * Browserslist queries to lower the CSS for, such as `['chrome >= 90', 'safari >= 15']`. Unset, nothing is lowered.
	 */
	targets?: string | readonly string[];
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

/** The Lightning CSS `targets` for browserslist `queries`, or `undefined` to lower nothing. */
async function resolveTargets(queries: LightningCssOptions['targets']): Promise<TransformOptions<never>['targets']> {
	if (!queries || queries.length === 0) return undefined;
	const { browserslistToTargets } = await loadLightningCss();
	return browserslistToTargets(browserslist(typeof queries === 'string' ? queries : [...queries]));
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
};

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
		cssModulesPattern: options?.cssModules?.pattern ?? DEFAULT_CSS_MODULES_PATTERN,
		minify: options?.minify ?? isProductionRuntime(),
		...withoutUndefined({
			drafts: options?.drafts,
			nonStandard: options?.nonStandard,
			visitor: options?.visitor,
			errorRecovery: options?.errorRecovery,
			targets: await resolveTargets(options?.targets),
			include: await toFeatureFlags(options?.include),
			exclude: await toFeatureFlags(options?.exclude),
		}),
	};
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
