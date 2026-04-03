import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Counter } from '@/components/counter';
import { BaseLayout } from '@/layouts/base-layout';
import { LogoSquircle, Logo } from '@/components/logo';
import { THEMES, type LogoVariant } from '@/components/logo.constants';

const LogosGrid = ({ variant }: { variant: LogoVariant }) => (
	<div className="logo-grid">
		<Logo name={`bw-${variant}`} config={THEMES.bw} variant={variant}>
			<span style={{ color: 'var(--color-on-background, black)' }}>ecopages</span>
		</Logo>
		<Logo name={`green-${variant}`} config={THEMES.green} variant={variant}>
			ecopages
		</Logo>
		<Logo name={`amber-${variant}`} config={THEMES.amber} variant={variant}>
			radiant
		</Logo>
		<Logo name={`blue-${variant}`} config={THEMES.blue} variant={variant}>
			script-injector
		</Logo>
		<Logo name={`yellow-${variant}`} config={THEMES.yellow} variant={variant}>
			logger
		</Logo>
	</div>
);

export default eco.page<{}, ReactNode>({
	dependencies: {
		stylesheets: ['./index.css'],
		components: [Counter, BaseLayout, LogoSquircle, Logo],
	},

	metadata: () => ({
		title: 'Home page',
		description: 'This is the homepage of the website',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	}),

	render: () => {
		return (
			<BaseLayout className="main-content">
				<LogoSquircle name="badge-flat" variant="flat">
					ecopages
				</LogoSquircle>
				<LogoSquircle name="badge-gradient" variant="gradient">
					radiant
				</LogoSquircle>
				<LogoSquircle name="badge-detailed" variant="detailed">
					logger
				</LogoSquircle>
				<LogoSquircle name="badge-detailed" variant="detailed">
					scripts-injector
				</LogoSquircle>

				<LogosGrid variant="flat" />
				<LogosGrid variant="gradient" />
				<LogosGrid variant="detailed" />
			</BaseLayout>
		);
	},
});
