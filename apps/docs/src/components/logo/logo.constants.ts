export const SCALES = {
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
} as const;

export type ScaleStop = keyof typeof SCALES.gray;
export type LogoMode = 'light' | 'dark';

type LeafGradientStops = [base: ScaleStop, gradient: ScaleStop];

export const createLeafConfig = (front: LeafGradientStops, mid: LeafGradientStops, back: LeafGradientStops) => {
	const s = SCALES.gray;
	return {
		front: s[front[0]],
		mid: s[mid[0]],
		back: s[back[0]],
		frontGradient: [s[front[0]], s[front[1]]] as const,
		midGradient: [s[mid[0]], s[mid[1]]] as const,
		backGradient: [s[back[0]], s[back[1]]] as const,
		shadow: s[950],
	};
};

export type LeafConfig = ReturnType<typeof createLeafConfig>;

export const BW_CONFIG = createLeafConfig([700, 800], [300, 400], [50, 100]);

export type LogoVariant = 'flat' | 'gradient';
export const DEFAULT_LOGO_SIZE = '1.75rem';

export const LOGO_PLAYGROUND_FONT_SIZE_RANGE = {
	defaultRem: 5.5,
	maxRem: 10,
	minRem: 1.5,
	stepRem: 0.25,
} as const;

export const LOGO_LAYER_SPECS = [
	{ key: 'back', y: 102 },
	{ key: 'mid', y: 60 },
	{ key: 'front', y: 18 },
] as const;

export const LOGO_SVG = {
	baseSize: '1.5em',
	logoScale: 0.7,
	viewBox: '-10 -20 200 220',
} as const;

export const BADGE_SVG = {
	backgroundRadius: '30%',
	borderWidth: '12%',
	cornerShape: 'squircle',
	height: '100%',
	logoScale: 0.92,
	translateX: 6.56,
	translateY: 6.4,
	viewBox: '-20 -4 205 205',
	width: '100%',
} as const;

export const BADGE_GRAIN_RECT = {
	height: '160',
	width: '220',
	x: '-20',
	y: '-20',
} as const;

export const BADGE_GRAIN_OVERLAYS = {
	dark: {
		fill: '#000000',
		mixBlendMode: 'multiply',
		opacity: '0.08',
	},
	light: {
		fill: '#FFFFFF',
		mixBlendMode: 'screen',
		opacity: '0.12',
	},
} as const;

export const BADGE_GRAIN_FILTERS = {
	dark: {
		baseFrequency: '0.95',
		componentValues: {
			a: '0 0.75',
			b: '0 0.32',
			g: '0 0.32',
			r: '0 0.32',
		},
		height: BADGE_GRAIN_RECT.height,
		numOctaves: '3',
		seed: '19',
		width: BADGE_GRAIN_RECT.width,
		x: BADGE_GRAIN_RECT.x,
		y: BADGE_GRAIN_RECT.y,
	},
	light: {
		baseFrequency: '0.7',
		componentValues: {
			a: '0 0.9',
			b: '0.72 1',
			g: '0.72 1',
			r: '0.72 1',
		},
		height: BADGE_GRAIN_RECT.height,
		numOctaves: '2',
		seed: '8',
		width: BADGE_GRAIN_RECT.width,
		x: BADGE_GRAIN_RECT.x,
		y: BADGE_GRAIN_RECT.y,
	},
} as const;

export const BADGE_SHADOW = {
	color: '#000000',
	height: '180%',
	opacity: '0.75',
	width: '180%',
	x: '-40%',
	y: '-40%',
} as const;

export const LEAF_SHADOW = {
	height: '180%',
	opacity: '0.75',
	width: '180%',
	x: '-40%',
	y: '-40%',
} as const;

export const LOGO_BACKGROUNDS = {
	dark: SCALES.gray[50],
	light: SCALES.gray[900],
} as const;

export const BADGE_STOP_CONFIG = {
	front: 50,
	mid: 200,
	back: 400,
} as const satisfies {
	front: ScaleStop;
	mid: ScaleStop;
	back: ScaleStop;
};

export const LEAF_PATH =
	'M93.4369 13.7461C9.08728 -35.8626 -0.000109112 64.7566 -0.000109112 64.7566C-0.000109112 64.7566 19.6444 24.2069 71.8524 57.5082C160.014 113.743 164.406 17.3765 164.406 17.3765C164.406 17.3765 157.355 51.3381 93.4369 13.7461Z';
export const MIDRIB_PATH = 'M0,64.756 C35,-58 120,118 164.406,17.376';

export const BADGE_CONFIG = createLeafConfig([400, 400], [200, 200], [50, 50]);

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

export const BADGE_DARK_CONFIG = invertLeafConfig(BADGE_STOP_CONFIG);
export const LOGO_DARK_CONFIG = createLeafConfig([500, 700], [300, 400], [50, 100]);
