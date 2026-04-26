import type { ReactNode, CSSProperties } from 'react';
import { eco } from '@ecopages/core';
import {
	BW_CONFIG,
	BADGE_CONFIG,
	LEAF_PATH,
	MIDRIB_PATH,
	SCALES,
	type ScaleStop,
	type LogoVariant,
	createLeafConfig,
} from './logo.constants';

const SQUIRCLE_BACKGROUND = SCALES.gray[900];
const SQUIRCLE_BACKGROUND_INVERTED = SCALES.gray[50];
const BADGE_LEAF_BORDER_WIDTH = '22';
const BADGE_LOGO_SCALE = 0.92;
const BADGE_LOGO_TRANSLATE_X = 6.56;
const BADGE_LOGO_TRANSLATE_Y = 6.4;

const LOGO_LAYER_SPECS = [
	{ key: 'back', y: 100, botStrokeOpacity: '0.15' },
	{ key: 'mid', y: 60, botStrokeOpacity: '0.2' },
	{ key: 'front', y: 20, botStrokeOpacity: '0.2' },
] as const;

const BADGE_SHADOW = {
	color: '#000000',
	opacity: '0.75',
} as const;

export type LogoMode = 'light' | 'dark';

type LeafConfig = ReturnType<typeof createLeafConfig>;

const getLayerFill = (config: LeafConfig, key: 'front' | 'mid' | 'back') => ({
	fillBase: config[key],
	fillGrad: config[`${key}Gradient`],
	topGrad: config[`${key}Top`],
	botGrad: config[`${key}Bot`],
});

const invertScaleStop = (stop: ScaleStop): ScaleStop => {
	const numericStop = Number(stop);
	const inverted = 1000 - numericStop;
	return (inverted === 1000 ? 950 : inverted) as ScaleStop;
};

const invertLeafConfig = (stops: {
	front: [ScaleStop, ScaleStop, ScaleStop];
	mid: [ScaleStop, ScaleStop, ScaleStop];
	back: [ScaleStop, ScaleStop, ScaleStop];
}) =>
	createLeafConfig(
		'gray',
		stops.front.map((stop) => invertScaleStop(stop)) as [ScaleStop, ScaleStop, ScaleStop],
		stops.mid.map((stop) => invertScaleStop(stop)) as [ScaleStop, ScaleStop, ScaleStop],
		stops.back.map((stop) => invertScaleStop(stop)) as [ScaleStop, ScaleStop, ScaleStop],
	);

const BADGE_STOP_CONFIG = {
	front: [50, 50, 100],
	mid: [200, 200, 300],
	back: [400, 400, 500],
} as const satisfies {
	front: [ScaleStop, ScaleStop, ScaleStop];
	mid: [ScaleStop, ScaleStop, ScaleStop];
	back: [ScaleStop, ScaleStop, ScaleStop];
};

const BADGE_DARK_CONFIG = invertLeafConfig(BADGE_STOP_CONFIG);

export const Logo = eco.component({
	dependencies: {
		stylesheets: ['./logo.css'],
	},
	render: ({
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
		const layers = LOGO_LAYER_SPECS.map((layer) => {
			const fills = getLayerFill(config, layer.key);
			return {
				...layer,
				...fills,
				fillGradId: `${idPrefix}-${layer.key}-grad`,
				topGradId: `${idPrefix}-${layer.key}-top`,
				botGradId: `${idPrefix}-${layer.key}-bot`,
				strokeColor: fills.botGrad[1],
			};
		});

		return (
			<div className="ecopages-logo">
				<svg
					width="1.5em"
					height="1.5em"
					viewBox="-10 -20 200 220"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<defs>
						<path id={`${idPrefix}-leaf`} d={LEAF_PATH} />

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
							<feDropShadow dx="0" dy="8" stdDeviation="5" floodColor={shadowColor} floodOpacity="0.75" />
						</filter>
					</defs>

					{layers.map((layer, index) => (
						<g key={index} transform={`translate(0, ${layer.y})`} filter={`url(#${idPrefix}-leaf-shadow)`}>
							{variant === 'flat' && <use href={`#${idPrefix}-leaf`} fill={layer.fillBase} />}
							{variant === 'gradient' && (
								<use href={`#${idPrefix}-leaf`} fill={`url(#${layer.fillGradId})`} />
							)}
							{variant === 'detailed' && (
								<>
									<use
										href={`#${idPrefix}-leaf`}
										fill={`url(#${layer.topGradId})`}
										clipPath={`url(#${idPrefix}-above-midrib)`}
									/>
									<use
										href={`#${idPrefix}-leaf`}
										fill={`url(#${layer.botGradId})`}
										clipPath={`url(#${idPrefix}-below-midrib)`}
									/>
									<use
										href={`#${idPrefix}-leaf`}
										stroke={layer.strokeColor}
										strokeWidth="0.75"
										strokeOpacity="0.1"
										fill="none"
									/>
									<path
										d={MIDRIB_PATH}
										stroke={layer.strokeColor}
										strokeWidth="0.75"
										strokeOpacity={layer.botStrokeOpacity}
										fill="none"
									/>
								</>
							)}
						</g>
					))}
				</svg>
				<span className="ecopages-logo__text">{children}</span>
			</div>
		);
	},
});

export const LogoSquircle = eco.component({
	dependencies: {
		stylesheets: ['./logo.css'],
	},
	render: ({
		name = 'logo-badge',
		variant = 'gradient',
		config = BADGE_CONFIG,
		mode = 'light',
		children,
	}: {
		name?: string;
		variant?: LogoVariant;
		config?: ReturnType<typeof createLeafConfig>;
		mode?: LogoMode;
		children?: ReactNode;
	}) => {
		const p = name;
		const c = mode === 'dark' && config === BADGE_CONFIG ? BADGE_DARK_CONFIG : config;
		const badgeBackground = mode === 'dark' ? SQUIRCLE_BACKGROUND_INVERTED : SQUIRCLE_BACKGROUND;
		const rootClassName = children ? 'ecopages-logo' : 'ecopages-logo ecopages-logo--badge';
		const layers = LOGO_LAYER_SPECS.map((layer) => {
			const fills = getLayerFill(c, layer.key);
			return {
				...layer,
				...fills,
				fillGradId: `${p}-${layer.key}`,
				topGradId: `${p}-${layer.key}-top`,
				botGradId: `${p}-${layer.key}-bot`,
			};
		});
		const leafBackplate = (
			<path d={LEAF_PATH} fill={badgeBackground} stroke={badgeBackground} strokeWidth={BADGE_LEAF_BORDER_WIDTH} />
		);
		const grainOverlay = (
			<>
				<rect
					x="-20"
					y="-20"
					width="220"
					height="160"
					fill="#FFFFFF"
					clipPath={`url(#${p}-leaf-body)`}
					filter={`url(#${p}-leaf-grain-light)`}
					opacity="0.12"
					style={{ mixBlendMode: 'screen' }}
				/>
				<rect
					x="-20"
					y="-20"
					width="220"
					height="160"
					fill="#000000"
					clipPath={`url(#${p}-leaf-body)`}
					filter={`url(#${p}-leaf-grain-dark)`}
					opacity="0.08"
					style={{ mixBlendMode: 'multiply' }}
				/>
			</>
		);

		return (
			<div className={rootClassName}>
				<div
					className="ecopages-logo__badge"
					style={{
						background: badgeBackground,
						borderRadius: '30%',
						...({ cornerShape: 'squircle' } as CSSProperties),
					}}
				>
					<svg
						width="100%"
						height="100%"
						viewBox="-20 -4 205 205"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<defs>
							<clipPath id={`${p}-leaf-body`}>
								<path d={LEAF_PATH} />
							</clipPath>
							<filter
								id={`${p}-leaf-grain-light`}
								x="-20"
								y="-20"
								width="220"
								height="160"
								filterUnits="userSpaceOnUse"
							>
								<feTurbulence
									type="fractalNoise"
									baseFrequency="0.7"
									numOctaves="2"
									seed="8"
									stitchTiles="stitch"
									result="noise"
								/>
								<feColorMatrix in="noise" type="saturate" values="0" result="grain" />
								<feComponentTransfer in="grain">
									<feFuncR type="table" tableValues="0.72 1" />
									<feFuncG type="table" tableValues="0.72 1" />
									<feFuncB type="table" tableValues="0.72 1" />
									<feFuncA type="table" tableValues="0 0.9" />
								</feComponentTransfer>
							</filter>
							<filter
								id={`${p}-leaf-grain-dark`}
								x="-20"
								y="-20"
								width="220"
								height="160"
								filterUnits="userSpaceOnUse"
							>
								<feTurbulence
									type="fractalNoise"
									baseFrequency="0.95"
									numOctaves="3"
									seed="19"
									stitchTiles="stitch"
									result="noise"
								/>
								<feColorMatrix in="noise" type="saturate" values="0" result="grain" />
								<feComponentTransfer in="grain">
									<feFuncR type="table" tableValues="0 0.32" />
									<feFuncG type="table" tableValues="0 0.32" />
									<feFuncB type="table" tableValues="0 0.32" />
									<feFuncA type="table" tableValues="0 0.75" />
								</feComponentTransfer>
							</filter>
							{variant === 'gradient' && (
								<>
									<linearGradient id={`${p}-back`} x1="0" y1="0" x2="0" y2="1">
										<stop offset="0%" stopColor={c.backGradient[0]} />
										<stop offset="50%" stopColor={c.backGradient[1]} />
										<stop offset="100%" stopColor={c.backGradient[2]} />
									</linearGradient>
									<linearGradient id={`${p}-mid`} x1="0" y1="0" x2="0" y2="1">
										<stop offset="0%" stopColor={c.midGradient[0]} />
										<stop offset="50%" stopColor={c.midGradient[1]} />
										<stop offset="100%" stopColor={c.midGradient[2]} />
									</linearGradient>
									<linearGradient id={`${p}-front`} x1="0" y1="0" x2="0" y2="1">
										<stop offset="0%" stopColor={c.frontGradient[0]} />
										<stop offset="50%" stopColor={c.frontGradient[1]} />
										<stop offset="100%" stopColor={c.frontGradient[2]} />
									</linearGradient>
								</>
							)}
							<filter id={`${p}-badge-shadow`} x="-40%" y="-40%" width="180%" height="180%">
								<feDropShadow
									dx="0"
									dy="8"
									stdDeviation="5"
									floodColor={BADGE_SHADOW.color}
									floodOpacity={BADGE_SHADOW.opacity}
								/>
							</filter>
							{variant === 'detailed' && (
								<>
									<clipPath id={`${p}-above`}>
										<path d="M-20,65 L0,64.756 C35,-58 120,118 164.406,17.376 L220,17 L220,-50 L-20,-50 Z" />
									</clipPath>
									<linearGradient id={`${p}-back-bot`} x1="0" y1="0" x2="0.5" y2="1">
										<stop offset="0%" stopColor={c.backBot[0]} />
										<stop offset="100%" stopColor={c.backBot[1]} />
									</linearGradient>
									<linearGradient id={`${p}-back-top`} x1="0" y1="0" x2="0.5" y2="1">
										<stop offset="0%" stopColor={c.backTop[0]} />
										<stop offset="100%" stopColor={c.backTop[1]} />
									</linearGradient>
									<linearGradient id={`${p}-mid-bot`} x1="0" y1="0" x2="0.5" y2="1">
										<stop offset="0%" stopColor={c.midBot[0]} />
										<stop offset="100%" stopColor={c.midBot[1]} />
									</linearGradient>
									<linearGradient id={`${p}-mid-top`} x1="0" y1="0" x2="0.5" y2="1">
										<stop offset="0%" stopColor={c.midTop[0]} />
										<stop offset="100%" stopColor={c.midTop[1]} />
									</linearGradient>
									<linearGradient id={`${p}-front-bot`} x1="0" y1="0" x2="0.5" y2="1">
										<stop offset="0%" stopColor={c.frontBot[0]} />
										<stop offset="100%" stopColor={c.frontBot[1]} />
									</linearGradient>
									<linearGradient id={`${p}-front-top`} x1="0" y1="0" x2="0.5" y2="1">
										<stop offset="0%" stopColor={c.frontTop[0]} />
										<stop offset="100%" stopColor={c.frontTop[1]} />
									</linearGradient>
								</>
							)}
						</defs>

						<g
							transform={`translate(${BADGE_LOGO_TRANSLATE_X}, ${BADGE_LOGO_TRANSLATE_Y}) scale(${BADGE_LOGO_SCALE})`}
						>
							{layers.map((layer, index) => (
								<g key={index} transform={`translate(0, ${layer.y})`}>
									{variant === 'flat' && (
										<>
											{leafBackplate}
											<g filter={`url(#${p}-badge-shadow)`}>
												<path d={LEAF_PATH} fill={layer.fillBase} />
												{grainOverlay}
											</g>
										</>
									)}
									{variant === 'gradient' && (
										<>
											{leafBackplate}
											<g filter={`url(#${p}-badge-shadow)`}>
												<path d={LEAF_PATH} fill={`url(#${layer.fillGradId})`} />
												{grainOverlay}
											</g>
										</>
									)}
									{variant === 'detailed' && (
										<>
											{leafBackplate}
											<g filter={`url(#${p}-badge-shadow)`}>
												<path d={LEAF_PATH} fill={`url(#${layer.botGradId})`} />
												<path
													d={LEAF_PATH}
													fill={`url(#${layer.topGradId})`}
													clipPath={`url(#${p}-above)`}
												/>
												{grainOverlay}
											</g>
										</>
									)}
								</g>
							))}
						</g>
					</svg>
				</div>
				{children && <span className="ecopages-logo__text">{children}</span>}
			</div>
		);
	},
});
