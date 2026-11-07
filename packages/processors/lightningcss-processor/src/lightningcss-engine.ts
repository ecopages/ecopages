import { isProductionRuntime, warnStylesheetOnce } from '@ecopages/core/processor';
import { Logger } from '@ecopages/logger';
import browserslist from 'browserslist';
import type { Features, TransformOptions, Visitor } from 'lightningcss';

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
}

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
	engine ??= import('lightningcss');
	return engine;
}

/** The Lightning CSS `targets` for browserslist `queries`, or `undefined` to lower nothing. */
export async function resolveTargets(
	queries: LightningCssOptions['targets'],
): Promise<TransformOptions<never>['targets']> {
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
>;

/**
 * Resolves the options of a Processor for an app rooted at `rootDir`.
 *
 * @remarks
 * Unset options are left out, not passed as `undefined`: the native binding rejects an explicit `undefined`. `projectRoot` makes the hashes Lightning CSS derives from a path relative to the app, so they match across machines.
 */
export async function resolveLightningCssOptions(
	options: LightningCssOptions | undefined,
	rootDir: string,
): Promise<ResolvedLightningCssOptions> {
	return {
		projectRoot: rootDir,
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

/** Logs the warnings of one stylesheet, once per message until its contents change, each with its location. */
export function logWarnings(
	warnings: readonly { message: string; loc: { line: number; column: number; source?: string } }[],
	file: string,
	source: string,
): void {
	for (const warning of warnings) {
		const { line, column } = warning.loc;
		warnStylesheetOnce(file, source, `${file}:${line}:${column} ${warning.message}`, (message) =>
			logger.warn(message),
		);
	}
}

/** Replaces a Lightning CSS failure with an error that names the file and the position, keeping the original as its cause. */
export function toStylesheetError(error: unknown, file: string): Error {
	if (!(error instanceof Error)) return new Error(`${file}: ${String(error)}`);
	const { fileName = file, loc, message } = error as LightningCssError;
	return new Error(`${fileName}${loc ? `:${loc.line}:${loc.column}` : ''} ${message}`, { cause: error });
}
