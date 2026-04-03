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

export type ScaleStop = keyof typeof SCALES.gray;
export type LeafStops = [ScaleStop, ScaleStop, ScaleStop];

export const createLeafConfig = (scale: keyof typeof SCALES, front: LeafStops, mid: LeafStops, back: LeafStops) => {
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

export const BW_CONFIG = createLeafConfig('gray', [200, 300, 400], [400, 500, 600], [600, 700, 800]);

export type LogoVariant = 'detailed' | 'flat' | 'gradient';

export const LEAF_PATH =
	'M93.4369 13.7461C9.08728 -35.8626 -0.000109112 64.7566 -0.000109112 64.7566C-0.000109112 64.7566 19.6444 24.2069 71.8524 57.5082C160.014 113.743 164.406 17.3765 164.406 17.3765C164.406 17.3765 157.355 51.3381 93.4369 13.7461Z';
export const MIDRIB_PATH = 'M0,64.756 C35,-58 120,118 164.406,17.376';

export const BADGE_CONFIG = createLeafConfig('gray', [50, 100, 100], [200, 300, 300], [400, 500, 500]);

export const THEMES = {
	bw: createLeafConfig('gray', [200, 300, 300], [400, 500, 500], [600, 700, 700]),
	green: createLeafConfig('green', [300, 400, 400], [500, 600, 600], [700, 800, 800]),
	amber: createLeafConfig('amber', [300, 400, 400], [500, 600, 600], [700, 800, 800]),
	blue: createLeafConfig('blue', [300, 400, 400], [500, 600, 600], [700, 800, 800]),
	yellow: createLeafConfig('yellow', [200, 300, 300], [400, 500, 500], [600, 700, 700]),
} as const;
