import type { ReactNode, CSSProperties } from 'react';
import { eco } from '@ecopages/core';
import { BW_CONFIG, BADGE_CONFIG, LEAF_PATH, MIDRIB_PATH, type LogoVariant, createLeafConfig } from './logo.constants';

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

					{[
						{
							y: 100,
							fillBase: config.back,
							fillGrad: `${idPrefix}-back-grad`,
							topGrad: `${idPrefix}-back-top`,
							botGrad: `${idPrefix}-back-bot`,
							strokeColor: config.backBot[1],
							botStrokeOpacity: '0.15',
						},
						{
							y: 60,
							fillBase: config.mid,
							fillGrad: `${idPrefix}-mid-grad`,
							topGrad: `${idPrefix}-mid-top`,
							botGrad: `${idPrefix}-mid-bot`,
							strokeColor: config.midBot[1],
							botStrokeOpacity: '0.2',
						},
						{
							y: 20,
							fillBase: config.front,
							fillGrad: `${idPrefix}-front-grad`,
							topGrad: `${idPrefix}-front-top`,
							botGrad: `${idPrefix}-front-bot`,
							strokeColor: config.frontBot[1],
							botStrokeOpacity: '0.2',
						},
					].map((layer, index) => (
						<g key={index} transform={`translate(0, ${layer.y})`} filter={`url(#${idPrefix}-leaf-shadow)`}>
							{variant === 'flat' && <use href={`#${idPrefix}-leaf`} fill={layer.fillBase} />}
							{variant === 'gradient' && (
								<use href={`#${idPrefix}-leaf`} fill={`url(#${layer.fillGrad})`} />
							)}
							{variant === 'detailed' && (
								<>
									<use
										href={`#${idPrefix}-leaf`}
										fill={`url(#${layer.topGrad})`}
										clipPath={`url(#${idPrefix}-above-midrib)`}
									/>
									<use
										href={`#${idPrefix}-leaf`}
										fill={`url(#${layer.botGrad})`}
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
		children,
	}: {
		name?: string;
		variant?: LogoVariant;
		config?: ReturnType<typeof createLeafConfig>;
		children?: ReactNode;
	}) => {
		const p = name;
		const c = config;

		return (
			<div className="ecopages-logo">
				<div
					style={{
						width: '1.2em',
						height: '1.2em',
						aspectRatio: '1 / 1',
						background: '#09090B',
						borderRadius: '30%',
						...({ cornerShape: 'squircle' } as CSSProperties),
						overflow: 'hidden',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
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
								<feDropShadow dx="0" dy="8" stdDeviation="5" floodColor="#000000" floodOpacity="0.75" />
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

						{[
							{
								y: 100,
								fillBase: c.back,
								fillGrad: `${p}-back`,
								botGrad: `${p}-back-bot`,
								topGrad: `${p}-back-top`,
								strokeColor: c.backBot[1],
							},
							{
								y: 60,
								fillBase: c.mid,
								fillGrad: `${p}-mid`,
								botGrad: `${p}-mid-bot`,
								topGrad: `${p}-mid-top`,
								strokeColor: c.midBot[1],
							},
							{
								y: 20,
								fillBase: c.front,
								fillGrad: `${p}-front`,
								botGrad: `${p}-front-bot`,
								topGrad: `${p}-front-top`,
								strokeColor: c.frontBot[1],
							},
						].map((layer, index) => (
							<g key={index} transform={`translate(0, ${layer.y})`} filter={`url(#${p}-badge-shadow)`}>
								{variant === 'flat' && (
									<path
										d={LEAF_PATH}
										fill={layer.fillBase}
										stroke="#09090B"
										strokeWidth="3"
										paintOrder="stroke fill"
									/>
								)}
								{variant === 'gradient' && (
									<path
										d={LEAF_PATH}
										fill={`url(#${layer.fillGrad})`}
										stroke="#09090B"
										strokeWidth="3"
										paintOrder="stroke fill"
									/>
								)}
								{variant === 'detailed' && (
									<>
										<path
											d={LEAF_PATH}
											fill={`url(#${layer.botGrad})`}
											stroke="#09090B"
											strokeWidth="3"
											paintOrder="stroke fill"
										/>
										<path
											d={LEAF_PATH}
											fill={`url(#${layer.topGrad})`}
											clipPath={`url(#${p}-above)`}
										/>
									</>
								)}
							</g>
						))}
					</svg>
				</div>
				{children && <span className="ecopages-logo__text">{children}</span>}
			</div>
		);
	},
});
