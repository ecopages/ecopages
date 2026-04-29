import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { LogoMarkup, LogoSquircle } from './logo-markup';
import { BADGE_CONFIG, createLeafConfig, type LogoMode, type LogoVariant } from './logo.constants';

export type { LogoMode } from './logo.constants';

export type LogoProps = Partial<Pick<HTMLAnchorElement, 'href' | 'target' | 'title'>> & {
	children?: JsxRenderable;
	config?: ReturnType<typeof createLeafConfig>;
	mode?: LogoMode;
	name?: string;
	shadow?: boolean;
	size?: string;
	squircle?: boolean;
	variant?: LogoVariant;
};

export const Logo = eco.component<LogoProps, JsxRenderable>({
	dependencies: {
		components: [LogoMarkup, LogoSquircle],
		stylesheets: ['./logo.css'],
	},
	render: ({
		children = 'ecopages',
		config,
		href,
		mode,
		name = 'logo',
		shadow = true,
		size,
		squircle = false,
		target,
		title,
		variant = 'gradient',
	}) => {
		const resolvedConfig = squircle ? (config ?? BADGE_CONFIG) : config;

		const renderLogo = (resolvedMode: LogoMode, resolvedName: string, className?: string) => (
			<span aria={className ? { hidden: true } : undefined} class={className}>
				{squircle ? (
					<LogoSquircle config={resolvedConfig} mode={resolvedMode} name={resolvedName} variant={variant}>
						{children}
					</LogoSquircle>
				) : (
					<LogoMarkup
						config={resolvedConfig}
						mode={resolvedMode}
						name={resolvedName}
						shadow={shadow}
						variant={variant}
					>
						{children}
					</LogoMarkup>
				)}
			</span>
		);

		const isThemeControlled = mode === undefined;

		return (
			<a
				class={isThemeControlled ? 'logo logo--theme-controlled' : 'logo'}
				href={href}
				target={target}
				title={title}
				style={size ? { '--ecopages-logo-size': size } : undefined}
			>
				{isThemeControlled
					? [
							renderLogo('light', `${name}-light`, 'logo__theme logo__theme--light'),
							renderLogo('dark', `${name}-dark`, 'logo__theme logo__theme--dark'),
						]
					: renderLogo(mode, name)}
			</a>
		);
	},
});
