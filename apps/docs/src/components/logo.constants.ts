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

export const BW_CONFIG = createLeafConfig([200, 400], [500, 600], [700, 800]);

export type LogoVariant = 'flat' | 'gradient';

export const LEAF_PATH =
	'M93.4369 13.7461C9.08728 -35.8626 -0.000109112 64.7566 -0.000109112 64.7566C-0.000109112 64.7566 19.6444 24.2069 71.8524 57.5082C160.014 113.743 164.406 17.3765 164.406 17.3765C164.406 17.3765 157.355 51.3381 93.4369 13.7461Z';
export const MIDRIB_PATH = 'M0,64.756 C35,-58 120,118 164.406,17.376';

export const BADGE_CONFIG = createLeafConfig([50, 50], [200, 200], [400, 400]);
