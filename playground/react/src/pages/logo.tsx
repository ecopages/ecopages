import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Counter } from '@/components/counter';
import { BaseLayout } from '@/layouts/base-layout';

const SCALES = {
	gray: {
		50: '#FAFAFA',
		100: '#F4F4F5',
		200: '#E4E4E7',
		300: '#D4D4D8',
		400: '#A1A1AA',
		500: '#71717A',
		600: '#52525B',
		700: '#3F3F46',
		800: '#27272A',
		900: '#18181B',
		950: '#09090B',
	},
	green: {
		50: '#F0FDF4',
		100: '#DCFCE7',
		200: '#BBF7D0',
		300: '#86EFAC',
		400: '#4ADE80',
		500: '#22C55E',
		600: '#16A34A',
		700: '#15803D',
		800: '#166534',
		900: '#14532D',
		950: '#052E16',
	},
	amber: {
		50: '#FFFBEB',
		100: '#FEF3C7',
		200: '#FDE68A',
		300: '#FCD34D',
		400: '#FBBF24',
		500: '#F59E0B',
		600: '#D97706',
		700: '#B45309',
		800: '#92400E',
		900: '#78350F',
		950: '#451A03',
	},
	blue: {
		50: '#EFF6FF',
		100: '#DBEAFE',
		200: '#BFDBFE',
		300: '#93C5FD',
		400: '#60A5FA',
		500: '#3B82F6',
		600: '#2563EB',
		700: '#1D4ED8',
		800: '#1E40AF',
		900: '#1E3A8A',
		950: '#172554',
	},
	yellow: {
		50: '#FEFCE8',
		100: '#FEF9C3',
		200: '#FEF08A',
		300: '#FDE047',
		400: '#FACC15',
		500: '#EAB308',
		600: '#CA8A04',
		700: '#A16207',
		800: '#854D0E',
		900: '#713F12',
		950: '#422006',
	},
} as const;

type ScaleStop = keyof typeof SCALES.gray;
type LeafStops = [ScaleStop, ScaleStop, ScaleStop];

const createLeafConfig = (scale: keyof typeof SCALES, front: LeafStops, mid: LeafStops, back: LeafStops) => {
	const s = SCALES[scale];
	return {
		front: s[front[0]],
		mid: s[mid[0]],
		back: s[back[0]],
		frontGradient: [s[front[0]], s[front[1]], s[front[2]]] as const,
		midGradient: [s[mid[0]], s[mid[1]], s[mid[2]]] as const,
		backGradient: [s[back[0]], s[back[1]], s[back[2]]] as const,
		frontTop: [s[front[0]], s[front[1]]] as const,
		frontBot: [s[front[1]], s[front[2]]] as const,
		midTop: [s[mid[0]], s[mid[1]]] as const,
		midBot: [s[mid[1]], s[mid[2]]] as const,
		backTop: [s[back[0]], s[back[1]]] as const,
		backBot: [s[back[1]], s[back[2]]] as const,
		shadow: s[950],
	};
};

const BW_CONFIG = createLeafConfig('gray', [200, 300, 400], [400, 500, 600], [600, 700, 800]);

type LogoVariant = 'detailed' | 'flat' | 'gradient';

export const Logo = ({
	config = BW_CONFIG,
	children,
	name = 'logo',
	variant = 'detailed',
}: {
	config?: ReturnType<typeof createLeafConfig>;
	children?: ReactNode;
	name?: string;
	variant?: LogoVariant;
}) => {
	const idPrefix = name;
	const shadowColor = config.shadow;

	return (
		<div className="ecopages-logo">
			<svg width="1.5em" height="1.5em" viewBox="-10 -20 200 220" fill="none" xmlns="http://www.w3.org/2000/svg">
				<defs>
					<path
						id={`${idPrefix}-leaf`}
						d="M93.4369 13.7461C9.08728 -35.8626 -0.000109112 64.7566 -0.000109112 64.7566C-0.000109112 64.7566 19.6444 24.2069 71.8524 57.5082C160.014 113.743 164.406 17.3765 164.406 17.3765C164.406 17.3765 157.355 51.3381 93.4369 13.7461Z"
					/>

					<clipPath id={`${idPrefix}-above-midrib`}>
						<path d="M-20,65 L0,64.756 C35,-58 120,118 164.406,17.376 L220,17 L220,-50 L-20,-50 Z" />
					</clipPath>
					<clipPath id={`${idPrefix}-below-midrib`}>
						<path d="M-20,65 L0,64.756 C35,-58 120,118 164.406,17.376 L220,17 L220,150 L-20,150 Z" />
					</clipPath>

					{variant === 'gradient' && (
						<>
							<linearGradient
								id={`${idPrefix}-back-grad`}
								x1="0"
								y1="0"
								x2="180"
								y2="180"
								gradientUnits="userSpaceOnUse"
							>
								<stop offset="0%" stopColor={config.backGradient[0]} />
								<stop offset="50%" stopColor={config.backGradient[1]} />
								<stop offset="100%" stopColor={config.backGradient[2]} />
							</linearGradient>
							<linearGradient
								id={`${idPrefix}-mid-grad`}
								x1="0"
								y1="0"
								x2="180"
								y2="180"
								gradientUnits="userSpaceOnUse"
							>
								<stop offset="0%" stopColor={config.midGradient[0]} />
								<stop offset="50%" stopColor={config.midGradient[1]} />
								<stop offset="100%" stopColor={config.midGradient[2]} />
							</linearGradient>
							<linearGradient
								id={`${idPrefix}-front-grad`}
								x1="0"
								y1="0"
								x2="180"
								y2="180"
								gradientUnits="userSpaceOnUse"
							>
								<stop offset="0%" stopColor={config.frontGradient[0]} />
								<stop offset="50%" stopColor={config.frontGradient[1]} />
								<stop offset="100%" stopColor={config.frontGradient[2]} />
							</linearGradient>
						</>
					)}

					{variant === 'detailed' && (
						<>
							<linearGradient id={`${idPrefix}-front-top`} x1="0" y1="0" x2="0.5" y2="1">
								<stop offset="0%" stopColor={config.frontTop[0]} />
								<stop offset="100%" stopColor={config.frontTop[1]} />
							</linearGradient>
							<linearGradient id={`${idPrefix}-front-bot`} x1="0" y1="0" x2="0.5" y2="1">
								<stop offset="0%" stopColor={config.frontBot[0]} />
								<stop offset="100%" stopColor={config.frontBot[1]} />
							</linearGradient>
							<linearGradient id={`${idPrefix}-mid-top`} x1="0" y1="0" x2="0.5" y2="1">
								<stop offset="0%" stopColor={config.midTop[0]} />
								<stop offset="100%" stopColor={config.midTop[1]} />
							</linearGradient>
							<linearGradient id={`${idPrefix}-mid-bot`} x1="0" y1="0" x2="0.5" y2="1">
								<stop offset="0%" stopColor={config.midBot[0]} />
								<stop offset="100%" stopColor={config.midBot[1]} />
							</linearGradient>
							<linearGradient id={`${idPrefix}-back-top`} x1="0" y1="0" x2="0.5" y2="1">
								<stop offset="0%" stopColor={config.backTop[0]} />
								<stop offset="100%" stopColor={config.backTop[1]} />
							</linearGradient>
							<linearGradient id={`${idPrefix}-back-bot`} x1="0" y1="0" x2="0.5" y2="1">
								<stop offset="0%" stopColor={config.backBot[0]} />
								<stop offset="100%" stopColor={config.backBot[1]} />
							</linearGradient>
						</>
					)}

					<filter id={`${idPrefix}-leaf-shadow`} x="-40%" y="-40%" width="180%" height="180%">
						<feDropShadow dx="1" dy="3" stdDeviation="4" floodColor={shadowColor} floodOpacity="0.2" />
					</filter>
				</defs>

				<g transform="translate(0, 100)" filter={`url(#${idPrefix}-leaf-shadow)`}>
					{variant === 'flat' && <use href={`#${idPrefix}-leaf`} fill={config.back} />}
					{variant === 'gradient' && <use href={`#${idPrefix}-leaf`} fill={`url(#${idPrefix}-back-grad)`} />}
					{variant === 'detailed' && (
						<>
							<use
								href={`#${idPrefix}-leaf`}
								fill={`url(#${idPrefix}-back-top)`}
								clipPath={`url(#${idPrefix}-above-midrib)`}
							/>
							<use
								href={`#${idPrefix}-leaf`}
								fill={`url(#${idPrefix}-back-bot)`}
								clipPath={`url(#${idPrefix}-below-midrib)`}
							/>
							<use
								href={`#${idPrefix}-leaf`}
								stroke={config.backBot[1]}
								strokeWidth="0.75"
								strokeOpacity="0.1"
								fill="none"
							/>
							<path
								d="M0,64.756 C35,-58 120,118 164.406,17.376"
								stroke={config.backBot[1]}
								strokeWidth="0.75"
								strokeOpacity="0.15"
								fill="none"
							/>
						</>
					)}
				</g>

				<g transform="translate(0, 60)" filter={`url(#${idPrefix}-leaf-shadow)`}>
					{variant === 'flat' && <use href={`#${idPrefix}-leaf`} fill={config.mid} />}
					{variant === 'gradient' && <use href={`#${idPrefix}-leaf`} fill={`url(#${idPrefix}-mid-grad)`} />}
					{variant === 'detailed' && (
						<>
							<use
								href={`#${idPrefix}-leaf`}
								fill={`url(#${idPrefix}-mid-top)`}
								clipPath={`url(#${idPrefix}-above-midrib)`}
							/>
							<use
								href={`#${idPrefix}-leaf`}
								fill={`url(#${idPrefix}-mid-bot)`}
								clipPath={`url(#${idPrefix}-below-midrib)`}
							/>
							<use
								href={`#${idPrefix}-leaf`}
								stroke={config.midBot[1]}
								strokeWidth="0.75"
								strokeOpacity="0.1"
								fill="none"
							/>
							<path
								d="M0,64.756 C35,-58 120,118 164.406,17.376"
								stroke={config.midBot[1]}
								strokeWidth="0.75"
								strokeOpacity="0.2"
								fill="none"
							/>
						</>
					)}
				</g>

				<g transform="translate(0, 20)" filter={`url(#${idPrefix}-leaf-shadow)`}>
					{variant === 'flat' && <use href={`#${idPrefix}-leaf`} fill={config.front} />}
					{variant === 'gradient' && <use href={`#${idPrefix}-leaf`} fill={`url(#${idPrefix}-front-grad)`} />}
					{variant === 'detailed' && (
						<>
							<use
								href={`#${idPrefix}-leaf`}
								fill={`url(#${idPrefix}-front-top)`}
								clipPath={`url(#${idPrefix}-above-midrib)`}
							/>
							<use
								href={`#${idPrefix}-leaf`}
								fill={`url(#${idPrefix}-front-bot)`}
								clipPath={`url(#${idPrefix}-below-midrib)`}
							/>
							<use
								href={`#${idPrefix}-leaf`}
								stroke={config.frontBot[1]}
								strokeWidth="0.75"
								strokeOpacity="0.1"
								fill="none"
							/>
							<path
								d="M0,64.756 C35,-58 120,118 164.406,17.376"
								stroke={config.frontBot[1]}
								strokeWidth="0.75"
								strokeOpacity="0.2"
								fill="none"
							/>
						</>
					)}
				</g>
			</svg>
			<span className="ecopages-logo__text">{children}</span>
		</div>
	);
};

const THEMES = {
	bw: createLeafConfig('gray', [200, 300, 300], [400, 500, 500], [600, 700, 700]),
	green: createLeafConfig('green', [300, 400, 400], [500, 600, 600], [700, 800, 800]),
	amber: createLeafConfig('amber', [300, 400, 400], [500, 600, 600], [700, 800, 800]),
	blue: createLeafConfig('blue', [300, 400, 400], [500, 600, 600], [700, 800, 800]),
	yellow: createLeafConfig('yellow', [200, 300, 300], [400, 500, 500], [600, 700, 700]),
} as const;

const Logos = ({ variant }: { variant: LogoVariant }) => (
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
			<BaseLayout className="main-content">
				<Logos variant="flat" />
				<Logos variant="gradient" />
				<Logos variant="detailed" />
			</BaseLayout>
		);
	},
});
