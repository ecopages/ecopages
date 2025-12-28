import type { EcoComponent } from '@ecopages/core';
import { cn } from '@/styles/utils';

export type BannerProps = {
	children: JSX.Element | JSX.Element[];
	type?: 'alert' | 'info';
	class?: string;
};

export type BannerTitleProps = {
	children: string;
	class?: string;
};

const BannerRoot: EcoComponent<BannerProps> = ({ children, type = 'info', class: className }) => {
	return (
		<div class={cn(`eco-banner eco-banner--${type}`, className)} role="alert">
			{children}
		</div>
	);
};

const BannerTitle: EcoComponent<BannerTitleProps> = ({ children, class: className }) => {
	return <p class={cn('eco-banner__title', className)}>{children}</p>;
};

export const Banner = Object.assign(BannerRoot, {
	Title: BannerTitle,
});

Banner.config = {
	dependencies: {
		stylesheets: ['./banner.css'],
	},
};
