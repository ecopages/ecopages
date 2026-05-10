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
		return (
			<div class="flex gap-1 items-center text-2xl font-semibold font-heading">
				<svg height="32" viewBox="0 0 35 42" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path
						d="M8.95038 19.0355C8.73635 19.7972 10.4934 24.8245 18.2298 23.3884C25.3299 22.0704 24.7298 10.8884 18.2298 13.8884C14.2596 15.7208 12.2883 33.409 22.2298 31.8884C29.9216 30.7119 28.75 6.88572 31.434 1.38842C28.4393 4.49823 5.89504 5.06009 2.22981 17.8884C1.27183 21.2414 3.22979 26.8884 8.95036 28.3884L2.22981 38.3884"
						stroke="currentColor"
						stroke-width="4"
						stroke-linecap="round"
					/>
				</svg>

				{children}
			</div>
		);

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
