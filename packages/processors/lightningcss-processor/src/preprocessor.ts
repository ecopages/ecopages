import type { StylesheetInvalidation } from '@ecopages/core/processor';

/** What a {@link LightningCssPreprocessor} returns for one stylesheet. */
export interface PreprocessedStylesheet {
	/** The CSS Lightning CSS reads in place of the source. */
	css: string;
	/** Absolute paths of the other files the preprocessor read; see `StylesheetTransformResult.dependencies`. */
	dependencies?: readonly string[];
}

/** What the Processor gives {@link LightningCssPreprocessor.transform}. */
export interface LightningCssPreprocessorContext {
	/** The app root. */
	rootDir: string;
	/** Runs the `transformSource` of the plugins over a stylesheet the stage reads itself. */
	transformSource?: (css: string, file: string) => Promise<string>;
}

/**
 * A stage that rewrites every stylesheet before the Lightning CSS Processor bundles, lowers and minifies it.
 *
 * @remarks
 * It runs inside the Processor, so a stylesheet the stage fails on fails as one Lightning CSS rejects: a build stops
 * and development keeps the last good output until a save fixes it.
 */
export interface LightningCssPreprocessor {
	/**
	 * Rewrites one stylesheet.
	 *
	 * @param css - Stylesheet source.
	 * @param file - Absolute path of the stylesheet, or the `processingOrigin` of a content dependency.
	 * @param context - `rootDir` is the app root. `transformSource` is the `transformSource` of the Processor's
	 * `plugins`, set only when a plugin has one: a stage that reads other stylesheets itself, as Tailwind does for
	 * its `@import`s, runs it over each of them so a plugin sees every stylesheet that reaches Lightning CSS.
	 */
	transform(css: string, file: string, context: LightningCssPreprocessorContext): Promise<PreprocessedStylesheet>;
	/**
	 * Names the stylesheets a change to other files makes stale; see `Processor.invalidateStylesheets`.
	 *
	 * @param files - The changed paths that are not stylesheets.
	 */
	invalidate?(files: readonly string[]): StylesheetInvalidation | Promise<StylesheetInvalidation>;
}
