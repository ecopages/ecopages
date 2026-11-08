import type { StylesheetInvalidation } from '@ecopages/core/processor';

/** What a {@link LightningCssPreprocessor} returns for one stylesheet. */
export interface PreprocessedStylesheet {
	/** The CSS Lightning CSS reads in place of the source. */
	css: string;
	/** Absolute paths of the other files the preprocessor read; see `StylesheetTransformResult.dependencies`. */
	dependencies?: readonly string[];
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
	 * @param context - `rootDir` is the app root.
	 */
	transform(css: string, file: string, context: { rootDir: string }): Promise<PreprocessedStylesheet>;
	/**
	 * Names the stylesheets a change to other files makes stale; see `Processor.invalidateStylesheets`.
	 *
	 * @param files - The changed paths that are not stylesheets.
	 */
	invalidate?(files: readonly string[]): StylesheetInvalidation | Promise<StylesheetInvalidation>;
}
