/**
 * Spinner — `@ecopages/radiant-ui/spinner`.
 *
 * `Spinner` owns this component's stylesheet, so listing it in a page or layout
 * `dependencies.components` ships everything it needs.
 *
 * Pure CSS, no script. Give the surrounding region `aria-busy` so assistive
 * technology hears about the wait.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiSpinner, type RuiSpinnerProps } from '@ecopages/radiant-ui/spinner';

export type SpinnerProps = RuiSpinnerProps;

export const Spinner = eco.component<SpinnerProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./spinner.css'],
	},
	render: RuiSpinner,
});
