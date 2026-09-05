/**
 * Alert — `@ecopages/radiant-ui/alert`.
 *
 * `Alert` owns this component's stylesheet and lazy script, so listing it in a
 * page or layout `dependencies.components` ships everything it needs.
 *
 * The primitive has two assemblies that look nothing alike: `inline` wants a
 * variant glyph beside one line of text, `banner` wants a title above a body.
 * Get it wrong and you render an alert with no icon, or body copy with no
 * styling. The layout is picked from the props here — a `title` means banner.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import {
	RuiAlert,
	RuiAlertDescription,
	RuiAlertIcon,
	RuiAlertTitle,
	type RuiAlertComponentProps,
} from '@ecopages/radiant-ui/alert';

export type AlertProps = Omit<RuiAlertComponentProps, 'children'> & {
	/** Headline. Passing one switches the default layout to `banner`. */
	title?: JsxRenderable;
	/** Replaces the default variant glyph on `inline` alerts; `false` drops it. */
	icon?: JsxRenderable | false;
	children?: JsxRenderable;
};

export const Alert = eco.component<AlertProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./alert.css'],
		scripts: [{ src: './alert.script.ts', lazy: { 'on:idle': true } }],
	},
	render: ({ title, icon, variant = 'info', layout, children, ...props }) => {
		if ((layout ?? (title ? 'banner' : 'inline')) === 'banner') {
			return (
				<RuiAlert {...props} variant={variant} layout="banner">
					{title ? <RuiAlertTitle>{title}</RuiAlertTitle> : null}
					<RuiAlertDescription>{children}</RuiAlertDescription>
				</RuiAlert>
			);
		}

		return (
			<RuiAlert {...props} variant={variant} layout="inline">
				{icon === false ? null : <RuiAlertIcon variant={variant}>{icon}</RuiAlertIcon>}
				<span>{children}</span>
			</RuiAlert>
		);
	},
});
