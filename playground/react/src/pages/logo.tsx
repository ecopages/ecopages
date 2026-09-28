import { eco } from '@ecopages/core';
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { BaseLayout } from '@/layouts/base-layout';
import { LogoSquircle, type LogoMode } from '@/components/logo';
import type { LogoVariant } from '@/components/logo.constants';

const PREVIEW_SIZES = [
	{ id: 'sm', label: '1.5rem', fontSize: '1.5rem' },
	{ id: 'md', label: '4rem', fontSize: '4rem' },
	{ id: 'lg', label: '8rem', fontSize: '8rem' },
] as const;

const PREVIEW_MODES: Array<{
	mode: LogoMode;
	label: string;
	className: string;
	description: string;
}> = [
	{
		mode: 'light',
		label: 'Light Mode',
		className: 'logo-sheet__panel--light',
		description: 'Default dark squircle with light leaves.',
	},
	{
		mode: 'dark',
		label: 'Dark Mode',
		className: 'logo-sheet__panel--dark',
		description: 'Inverted badge treatment for dark surfaces.',
	},
];

const PREVIEW_VARIANTS: LogoVariant[] = ['flat', 'gradient', 'detailed'];

const createLogoSizeStyle = (fontSize: string) => ({ '--ecopages-logo-size': fontSize }) as CSSProperties;

const NAMED_VARIANTS = [
	{ id: 'ecopages', label: 'ecopages' },
	{ id: 'radiant', label: 'radiant' },
	{ id: 'scripts-injector', label: 'scripts-injector' },
	{ id: 'logger', label: 'logger' },
] as const;

export default eco.page<{}, ReactNode>({
	dependencies: {
		stylesheets: ['./index.css'],
		components: [BaseLayout, LogoSquircle],
	},

	metadata: () => ({
		title: 'Home page',
		description: 'This is the homepage of the website',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	}),

	render: () => {
		return (
			<BaseLayout className="logo-lab">
				<div className="logo-lab__intro">
					<h1 className="logo-lab__title">Logo Badge Sheet</h1>
					<p className="logo-lab__copy">
						Single-sheet comparison for light and dark treatments at 1.5rem, 4rem, and 8rem.
					</p>
				</div>

				<div className="logo-sheet">
					<div className="logo-sheet__corner">Size</div>
					{PREVIEW_MODES.map((previewMode) => (
						<div key={previewMode.mode} className="logo-sheet__mode-heading">
							<h2>{previewMode.label}</h2>
							<p>{previewMode.description}</p>
						</div>
					))}

					{PREVIEW_SIZES.map((size) => (
						<Fragment key={size.id}>
							<div className="logo-sheet__size-label">
								<span>{size.label}</span>
							</div>
							{PREVIEW_MODES.map((previewMode) => (
								<section
									key={`${previewMode.mode}-${size.id}`}
									className={`logo-sheet__panel ${previewMode.className}`}
								>
									{PREVIEW_VARIANTS.map((variant) => (
										<article
											key={`${previewMode.mode}-${size.id}-${variant}`}
											className="logo-sheet__variant-frame"
										>
											<span className="logo-sheet__variant-label">{variant}</span>
											<div
												className="logo-sheet__variant-surface"
												style={createLogoSizeStyle(size.fontSize)}
											>
												<LogoSquircle
													name={`sheet-${previewMode.mode}-${size.id}-${variant}`}
													mode={previewMode.mode}
													variant={variant}
												/>
											</div>
										</article>
									))}
								</section>
							))}
						</Fragment>
					))}
				</div>

				<div className="logo-lab__intro">
					<h2 className="logo-lab__section-title">Named Variants</h2>
					<p className="logo-lab__copy">
						Review the four badge-and-wordmark combinations at each target size in both light and dark mode.
					</p>
				</div>

				<div className="logo-sheet logo-sheet--names">
					<div className="logo-sheet__corner">Size</div>
					{PREVIEW_MODES.map((previewMode) => (
						<div key={`name-${previewMode.mode}`} className="logo-sheet__mode-heading">
							<h2>{previewMode.label}</h2>
							<p>{previewMode.description}</p>
						</div>
					))}

					{PREVIEW_SIZES.map((size) => (
						<Fragment key={`name-${size.id}`}>
							<div className="logo-sheet__size-label">
								<span>{size.label}</span>
							</div>
							{PREVIEW_MODES.map((previewMode) => (
								<section
									key={`name-${previewMode.mode}-${size.id}`}
									className={`logo-sheet__panel ${previewMode.className} logo-sheet__panel--names-grid`}
								>
									{NAMED_VARIANTS.map((variant) => (
										<div
											key={`name-${previewMode.mode}-${size.id}-${variant.id}`}
											className="logo-sheet__named-surface"
											style={createLogoSizeStyle(size.fontSize)}
										>
											<LogoSquircle
												name={`name-${previewMode.mode}-${size.id}-${variant.id}`}
												mode={previewMode.mode}
												variant="gradient"
											>
												{variant.label}
											</LogoSquircle>
										</div>
									))}
								</section>
							))}
						</Fragment>
					))}
				</div>
			</BaseLayout>
		);
	},
});
