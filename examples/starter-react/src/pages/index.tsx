import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Counter } from '@/components/counter';
import { BaseLayout } from '@/layouts/base-layout';

const EcopagesLogo = () => {
	return (
		<div className="ecopages-logo">
			<svg width="1em" height="1em" viewBox="-10 -20 200 220" fill="none" xmlns="http://www.w3.org/2000/svg">
				<defs>
					<linearGradient id="paint3_linear" x1="0" y1="0" x2="180" y2="180" gradientUnits="userSpaceOnUse">
						<stop offset="0%" stopColor="#5bae52" />
						<stop offset="52%" stopColor="#318237" />
						<stop offset="100%" stopColor="#184a22" />
					</linearGradient>
					<linearGradient id="paint2_linear" x1="0" y1="0" x2="180" y2="180" gradientUnits="userSpaceOnUse">
						<stop offset="0%" stopColor="#8bd672" />
						<stop offset="50%" stopColor="#4fab44" />
						<stop offset="100%" stopColor="#2c7231" />
					</linearGradient>
					<linearGradient id="paint1_linear" x1="0" y1="0" x2="180" y2="180" gradientUnits="userSpaceOnUse">
						<stop offset="0%" stopColor="#bae2a6" />
						<stop offset="48%" stopColor="#81cf61" />
						<stop offset="100%" stopColor="#4da341" />
					</linearGradient>

					<filter id="shadow1" x="-20%" y="-20%" width="150%" height="150%">
						<feDropShadow dx="2" dy="8" stdDeviation="6" floodColor="rgba(15,44,20,0.24)" />
					</filter>
					<filter id="shadow2" x="-20%" y="-20%" width="150%" height="150%">
						<feDropShadow dx="2" dy="5" stdDeviation="4" floodColor="rgba(27,73,32,0.18)" />
					</filter>
					<filter id="shadow3" x="-20%" y="-20%" width="150%" height="150%">
						<feDropShadow dx="1" dy="3" stdDeviation="3" floodColor="rgba(45,97,49,0.12)" />
					</filter>

					<g id="leaf-shape">
						<path d="M93.4369 13.7461C9.08728 -35.8626 -0.000109112 64.7566 -0.000109112 64.7566C-0.000109112 64.7566 19.6444 24.2069 71.8524 57.5082C160.014 113.743 164.406 17.3765 164.406 17.3765C164.406 17.3765 157.355 51.3381 93.4369 13.7461Z" />
					</g>
				</defs>

				<g transform="translate(0, 100)" filter="url(#shadow1)">
					<use href="#leaf-shape" fill="url(#paint1_linear)" />
				</g>

				<g transform="translate(0, 60)" filter="url(#shadow2)">
					<use href="#leaf-shape" fill="url(#paint2_linear)" />
				</g>

				<g transform="translate(0, 20)" filter="url(#shadow3)">
					<use href="#leaf-shape" fill="url(#paint3_linear)" />
				</g>
			</svg>
			<span className="ecopages-logo__text">ecopages</span>
		</div>
	);
};

const EcopagesLogoBlackAndWhite = () => {
	return (
		<div className="ecopages-logo">
			<svg width="1em" height="1em" viewBox="-10 -20 200 220" fill="none" xmlns="http://www.w3.org/2000/svg">
				<defs>
					<g id="leaf-shape-bw">
						<path d="M93.4369 13.7461C9.08728 -35.8626 -0.000109112 64.7566 -0.000109112 64.7566C-0.000109112 64.7566 19.6444 24.2069 71.8524 57.5082C160.014 113.743 164.406 17.3765 164.406 17.3765C164.406 17.3765 157.355 51.3381 93.4369 13.7461Z" />
					</g>
				</defs>

				{/* Render backwards with a white stroke to create structural separation between the overlapping elements */}
				<g transform="translate(0, 100)">
					<use
						href="#leaf-shape-bw"
						fill="var(--color-on-background, black)"
						stroke="var(--color-bg, white)"
						strokeWidth="6"
						strokeLinejoin="round"
					/>
				</g>

				<g transform="translate(0, 60)">
					<use
						href="#leaf-shape-bw"
						fill="var(--color-on-background, black)"
						stroke="var(--color-bg, white)"
						strokeWidth="6"
						strokeLinejoin="round"
					/>
				</g>

				<g transform="translate(0, 20)">
					<use
						href="#leaf-shape-bw"
						fill="var(--color-on-background, black)"
						stroke="var(--color-bg, white)"
						strokeWidth="6"
						strokeLinejoin="round"
					/>
				</g>
			</svg>
			<span className="ecopages-logo__text" style={{ color: 'var(--color-on-background, black)' }}>
				ecopages
			</span>
		</div>
	);
};

export default eco.page<{}, ReactNode>({
	dependencies: {
		stylesheets: ['./index.css'],
		components: [Counter, BaseLayout],
	},

	metadata: () => ({
		title: 'Home page',
		description: 'This is the homepage of the website',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	}),

	render: () => {
		return (
			<BaseLayout class="main-content">
				<EcopagesLogoBlackAndWhite />
				<EcopagesLogo />
				<Counter defaultValue={10} />
			</BaseLayout>
		);
	},
});
