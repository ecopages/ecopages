import type { EcoComponent } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { Logo as PlainLogo, LogoSquircle, type LogoMode } from '../logo';
import type { LogoVariant } from '../logo.constants';
import { BADGE_CONFIG, createLeafConfig } from '../logo.constants';

export type { LogoMode } from '../logo';

export type LogoProps = Pick<HTMLAnchorElement, 'href' | 'target' | 'title'> & {
	children?: JsxRenderable;
	config?: ReturnType<typeof createLeafConfig>;
	mode?: LogoMode;
	name?: string;
	shadow?: boolean;
	size?: string;
	squircle?: boolean;
	variant?: LogoVariant;
};

export const Logo: EcoComponent<LogoProps> = ({
	children = 'ecopages',
	config,
	href,
	mode,
	name = 'logo',
	shadow = true,
	size = '1.75rem',
	squircle = true,
	target,
	title,
	variant = 'gradient',
}) => {
	const resolvedConfig = squircle ? (config ?? BADGE_CONFIG) : config;
	const renderLogo = (resolvedMode: LogoMode, resolvedName: string, className?: string) => (
		<span aria-hidden={className ? 'true' : undefined} class={className}>
			{squircle ? (
				<LogoSquircle config={resolvedConfig} mode={resolvedMode} name={resolvedName} variant={variant}>
					{children}
				</LogoSquircle>
			) : (
				<PlainLogo
					config={resolvedConfig}
					mode={resolvedMode}
					name={resolvedName}
					shadow={shadow}
					variant={variant}
				>
					{children}
				</PlainLogo>
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
			style={{ '--ecopages-logo-size': size }}
		>
			{isThemeControlled
				? [
						renderLogo('light', `${name}-light`, 'logo__theme logo__theme--light'),
						renderLogo('dark', `${name}-dark`, 'logo__theme logo__theme--dark'),
					]
				: renderLogo(mode, name)}
		</a>
	);
};

Logo.config = {
	dependencies: {
		components: [PlainLogo, LogoSquircle],
		stylesheets: ['./logo.css'],
	},
};
