import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import {
	BADGE_DARK_CONFIG,
	BW_CONFIG,
	BADGE_CONFIG,
	BADGE_GRAIN_FILTERS,
	BADGE_GRAIN_OVERLAYS,
	BADGE_GRAIN_RECT,
	BADGE_SHADOW,
	BADGE_SVG,
	LEAF_PATH,
	LEAF_SHADOW,
	type LeafConfig,
	LOGO_BACKGROUNDS,
	LOGO_DARK_CONFIG,
	LOGO_LAYER_SPECS,
	type LogoMode,
	LOGO_SVG,
	type LogoVariant,
	createLeafConfig,
} from './logo.constants';

const getLayerFill = (config: LeafConfig, key: 'front' | 'mid' | 'back') => ({
	fillBase: config[key],
	fillGrad: config[`${key}Gradient`],
});

export const LogoMarkup = eco.component({
	dependencies: {
		stylesheets: ['./logo-markup.css'],
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
					width={`calc(${LOGO_SVG.baseSize} * ${LOGO_SVG.logoScale})`}
					height={`calc(${LOGO_SVG.baseSize} * ${LOGO_SVG.logoScale})`}
					viewBox={LOGO_SVG.viewBox}
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
							<filter
								id={`${idPrefix}-leaf-shadow`}
								x={LEAF_SHADOW.x}
								y={LEAF_SHADOW.y}
								width={LEAF_SHADOW.width}
								height={LEAF_SHADOW.height}
							>
								<feDropShadow
									dx="0"
									dy="8"
									stdDeviation="5"
									flood-color={c.shadow}
									flood-opacity={LEAF_SHADOW.opacity}
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
		stylesheets: ['./logo-markup.css'],
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
		const badgeBackground = mode === 'dark' ? LOGO_BACKGROUNDS.dark : LOGO_BACKGROUNDS.light;
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
				stroke-width={BADGE_SVG.borderWidth}
			/>
		);
		const grainOverlay = (
			<>
				<rect
					x={BADGE_GRAIN_RECT.x}
					y={BADGE_GRAIN_RECT.y}
					width={BADGE_GRAIN_RECT.width}
					height={BADGE_GRAIN_RECT.height}
					fill={BADGE_GRAIN_OVERLAYS.light.fill}
					clip-path={`url(#${p}-leaf-body)`}
					filter={`url(#${p}-leaf-grain-light)`}
					opacity={BADGE_GRAIN_OVERLAYS.light.opacity}
					style={`mix-blend-mode: ${BADGE_GRAIN_OVERLAYS.light.mixBlendMode}`}
				/>
				<rect
					x={BADGE_GRAIN_RECT.x}
					y={BADGE_GRAIN_RECT.y}
					width={BADGE_GRAIN_RECT.width}
					height={BADGE_GRAIN_RECT.height}
					fill={BADGE_GRAIN_OVERLAYS.dark.fill}
					clip-path={`url(#${p}-leaf-body)`}
					filter={`url(#${p}-leaf-grain-dark)`}
					opacity={BADGE_GRAIN_OVERLAYS.dark.opacity}
					style={`mix-blend-mode: ${BADGE_GRAIN_OVERLAYS.dark.mixBlendMode}`}
				/>
			</>
		);

		return (
			<div class={rootClassName}>
				<div
					class="ecopages-logo__badge"
					style={`background: ${badgeBackground}; border-radius: ${BADGE_SVG.backgroundRadius}; corner-shape: ${BADGE_SVG.cornerShape};`}
				>
					<svg
						width={BADGE_SVG.width}
						height={BADGE_SVG.height}
						viewBox={BADGE_SVG.viewBox}
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<defs>
							<clipPath id={`${p}-leaf-body`}>
								<path d={LEAF_PATH} />
							</clipPath>
							<filter
								id={`${p}-leaf-grain-light`}
								x={BADGE_GRAIN_FILTERS.light.x}
								y={BADGE_GRAIN_FILTERS.light.y}
								width={BADGE_GRAIN_FILTERS.light.width}
								height={BADGE_GRAIN_FILTERS.light.height}
								filterUnits="userSpaceOnUse"
							>
								<feTurbulence
									type="fractalNoise"
									baseFrequency={BADGE_GRAIN_FILTERS.light.baseFrequency}
									numOctaves={BADGE_GRAIN_FILTERS.light.numOctaves}
									seed={BADGE_GRAIN_FILTERS.light.seed}
									stitchTiles="stitch"
									result="noise"
								/>
								<feColorMatrix in="noise" type="saturate" values="0" result="grain" />
								<feComponentTransfer in="grain">
									<feFuncR type="table" tableValues={BADGE_GRAIN_FILTERS.light.componentValues.r} />
									<feFuncG type="table" tableValues={BADGE_GRAIN_FILTERS.light.componentValues.g} />
									<feFuncB type="table" tableValues={BADGE_GRAIN_FILTERS.light.componentValues.b} />
									<feFuncA type="table" tableValues={BADGE_GRAIN_FILTERS.light.componentValues.a} />
								</feComponentTransfer>
							</filter>
							<filter
								id={`${p}-leaf-grain-dark`}
								x={BADGE_GRAIN_FILTERS.dark.x}
								y={BADGE_GRAIN_FILTERS.dark.y}
								width={BADGE_GRAIN_FILTERS.dark.width}
								height={BADGE_GRAIN_FILTERS.dark.height}
								filterUnits="userSpaceOnUse"
							>
								<feTurbulence
									type="fractalNoise"
									baseFrequency={BADGE_GRAIN_FILTERS.dark.baseFrequency}
									numOctaves={BADGE_GRAIN_FILTERS.dark.numOctaves}
									seed={BADGE_GRAIN_FILTERS.dark.seed}
									stitchTiles="stitch"
									result="noise"
								/>
								<feColorMatrix in="noise" type="saturate" values="0" result="grain" />
								<feComponentTransfer in="grain">
									<feFuncR type="table" tableValues={BADGE_GRAIN_FILTERS.dark.componentValues.r} />
									<feFuncG type="table" tableValues={BADGE_GRAIN_FILTERS.dark.componentValues.g} />
									<feFuncB type="table" tableValues={BADGE_GRAIN_FILTERS.dark.componentValues.b} />
									<feFuncA type="table" tableValues={BADGE_GRAIN_FILTERS.dark.componentValues.a} />
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
							<filter
								id={`${p}-badge-shadow`}
								x={BADGE_SHADOW.x}
								y={BADGE_SHADOW.y}
								width={BADGE_SHADOW.width}
								height={BADGE_SHADOW.height}
							>
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
							transform={`translate(${BADGE_SVG.translateX}, ${BADGE_SVG.translateY}) scale(${BADGE_SVG.logoScale})`}
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