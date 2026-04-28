import { eco } from '@ecopages/core';
import {
	BW_CONFIG,
	BADGE_CONFIG,
	LEAF_PATH,
	SCALES,
	type LogoVariant,
	type ScaleStop,
	createLeafConfig,
} from './logo.constants';
import type { JsxRenderable } from '@ecopages/jsx';

const SQUIRCLE_BACKGROUND = SCALES.gray[900];
const SQUIRCLE_BACKGROUND_INVERTED = SCALES.gray[50];
const BADGE_LEAF_BORDER_WIDTH = '26';
const BADGE_LOGO_SCALE = 0.92;
const BADGE_LOGO_TRANSLATE_X = 6.56;
const BADGE_LOGO_TRANSLATE_Y = 6.4;

const LOGO_LAYER_SPECS = [
	{ key: 'back', y: 100 },
	{ key: 'mid', y: 60 },
	{ key: 'front', y: 20 },
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
});

const invertScaleStop = (stop: ScaleStop): ScaleStop => {
	const numericStop = Number(stop);
	const inverted = 1000 - numericStop;
	return (inverted === 1000 ? 950 : inverted) as ScaleStop;
};

const invertLeafConfig = (stops: { front: ScaleStop; mid: ScaleStop; back: ScaleStop }) =>
	createLeafConfig(
		[invertScaleStop(stops.front), invertScaleStop(stops.front)],
		[invertScaleStop(stops.mid), invertScaleStop(stops.mid)],
		[invertScaleStop(stops.back), invertScaleStop(stops.back)],
	);

const BADGE_STOP_CONFIG = {
	front: 50,
	mid: 200,
	back: 400,
} as const satisfies {
	front: ScaleStop;
	mid: ScaleStop;
	back: ScaleStop;
};

const BADGE_DARK_CONFIG = invertLeafConfig(BADGE_STOP_CONFIG);
const LOGO_DARK_CONFIG = createLeafConfig([50, 100], [200, 300], [400, 500]);

export const Logo = eco.component({
	dependencies: {
		stylesheets: ['./logo.css'],
	},
	render: ({
		config = BW_CONFIG,
		children,
		mode = 'light',
		name = 'logo',
		shadow = true,
		variant = 'gradient',
	}: {
		config?: ReturnType<typeof createLeafConfig>;
		children?: JsxRenderable;
		mode?: LogoMode;
		name?: string;
		shadow?: boolean;
		variant?: LogoVariant;
	}) => {
		const c = mode === 'dark' && config === BW_CONFIG ? LOGO_DARK_CONFIG : config;
		const idPrefix = name;
		const hasText = children !== undefined && children !== null && children !== '';
		const rootClassName = hasText ? 'ecopages-logo' : 'ecopages-logo ecopages-logo--badge';
		const layers = LOGO_LAYER_SPECS.map((layer) => {
			const fills = getLayerFill(c, layer.key);
			return {
				...layer,
				...fills,
				fillGradId: `${idPrefix}-${layer.key}-grad`,
			};
		});

		return (
			<div class={rootClassName}>
				<svg
					width="1.5em"
					height="1.5em"
					viewBox="-10 -20 200 220"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<defs>
						<path id={`${idPrefix}-leaf`} d={LEAF_PATH} />
						{variant === 'gradient' && (
							<>
								<linearGradient
									id={`${idPrefix}-back-grad`}
									x1="0"
									y1="0"
									x2="0"
									y2="180"
									gradientUnits="userSpaceOnUse"
								>
									<stop offset="0%" stop-color={c.backGradient[0]} />
									<stop offset="100%" stop-color={c.backGradient[1]} />
								</linearGradient>
								<linearGradient
									id={`${idPrefix}-mid-grad`}
									x1="0"
									y1="0"
									x2="0"
									y2="180"
									gradientUnits="userSpaceOnUse"
								>
									<stop offset="0%" stop-color={c.midGradient[0]} />
									<stop offset="100%" stop-color={c.midGradient[1]} />
								</linearGradient>
								<linearGradient
									id={`${idPrefix}-front-grad`}
									x1="0"
									y1="0"
									x2="0"
									y2="180"
									gradientUnits="userSpaceOnUse"
								>
									<stop offset="0%" stop-color={c.frontGradient[0]} />
									<stop offset="100%" stop-color={c.frontGradient[1]} />
								</linearGradient>
							</>
						)}

						{shadow && (
							<filter id={`${idPrefix}-leaf-shadow`} x="-40%" y="-40%" width="180%" height="180%">
								<feDropShadow
									dx="0"
									dy="8"
									stdDeviation="5"
									flood-color={c.shadow}
									flood-opacity="0.75"
								/>
							</filter>
						)}
					</defs>

					{layers.map((layer, index) => (
						<g key={index} transform={`translate(0, ${layer.y})`}>
							<g filter={shadow ? `url(#${idPrefix}-leaf-shadow)` : undefined}>
								{variant === 'flat' && <use href={`#${idPrefix}-leaf`} fill={layer.fillBase} />}
								{variant === 'gradient' && (
									<use href={`#${idPrefix}-leaf`} fill={`url(#${layer.fillGradId})`} />
								)}
							</g>
						</g>
					))}
				</svg>
				{hasText && <span class="ecopages-logo__text">{children}</span>}
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
		config = BADGE_CONFIG,
		mode = 'light',
		children,
		variant = 'gradient',
	}: {
		name?: string;
		config?: ReturnType<typeof createLeafConfig>;
		mode?: LogoMode;
		children?: JsxRenderable;
		variant?: LogoVariant;
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
			};
		});
		const leafBackplate = (
			<path
				d={LEAF_PATH}
				fill={badgeBackground}
				stroke={badgeBackground}
				stroke-width={BADGE_LEAF_BORDER_WIDTH}
			/>
		);
		const grainOverlay = (
			<>
				<rect
					x="-20"
					y="-20"
					width="220"
					height="160"
					fill="#FFFFFF"
					clip-path={`url(#${p}-leaf-body)`}
					filter={`url(#${p}-leaf-grain-light)`}
					opacity="0.12"
					style="mix-blend-mode: screen"
				/>
				<rect
					x="-20"
					y="-20"
					width="220"
					height="160"
					fill="#000000"
					clip-path={`url(#${p}-leaf-body)`}
					filter={`url(#${p}-leaf-grain-dark)`}
					opacity="0.08"
					style="mix-blend-mode: multiply"
				/>
			</>
		);

		return (
			<div class={rootClassName}>
				<div
					class="ecopages-logo__badge"
					style={`background: ${badgeBackground}; border-radius: 30%; corner-shape: squircle;`}
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
										<stop offset="0%" stop-color={c.backGradient[0]} />
										<stop offset="100%" stop-color={c.backGradient[1]} />
									</linearGradient>
									<linearGradient id={`${p}-mid`} x1="0" y1="0" x2="0" y2="1">
										<stop offset="0%" stop-color={c.midGradient[0]} />
										<stop offset="100%" stop-color={c.midGradient[1]} />
									</linearGradient>
									<linearGradient id={`${p}-front`} x1="0" y1="0" x2="0" y2="1">
										<stop offset="0%" stop-color={c.frontGradient[0]} />
										<stop offset="100%" stop-color={c.frontGradient[1]} />
									</linearGradient>
								</>
							)}
							<filter id={`${p}-badge-shadow`} x="-40%" y="-40%" width="180%" height="180%">
								<feDropShadow
									dx="0"
									dy="8"
									stdDeviation="5"
									flood-color={BADGE_SHADOW.color}
									flood-opacity={BADGE_SHADOW.opacity}
								/>
							</filter>
						</defs>

						<g
							transform={`translate(${BADGE_LOGO_TRANSLATE_X}, ${BADGE_LOGO_TRANSLATE_Y}) scale(${BADGE_LOGO_SCALE})`}
						>
							{layers.map((layer, index) => (
								<g key={index} transform={`translate(0, ${layer.y})`}>
									{leafBackplate}
									<g filter={`url(#${p}-badge-shadow)`}>
										<path
											d={LEAF_PATH}
											fill={variant === 'gradient' ? `url(#${layer.fillGradId})` : layer.fillBase}
										/>
										{grainOverlay}
									</g>
								</g>
							))}
						</g>
					</svg>
				</div>
				{children && <span class="ecopages-logo__text">{children}</span>}
			</div>
		);
	},
});
