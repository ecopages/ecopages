import { hashString } from '../hash.ts';

/**
 * Draws a product placeholder: a soft backdrop and a few shapes, all derived from `seed`.
 *
 * @remarks
 * It stands in for photography so the template ships no image files; a real catalog replaces the image route.
 * The output is a few hundred bytes, so a listing of many products stays light.
 */
export function renderPlaceholderSvg(seed: string): string {
	const hash = hashString(seed);
	const hue = hash % 360;
	const accentHue = (hue + 30 + ((hash >>> 9) % 120)) % 360;
	const shape = (hash >>> 4) % 3;
	const offset = 140 + ((hash >>> 12) % 120);
	const radius = 60 + ((hash >>> 16) % 50);

	const backdrop = `oklch(0.95 0.03 ${hue})`;
	const floor = `oklch(0.88 0.05 ${hue})`;
	const body = `oklch(0.62 0.12 ${hue})`;
	const accent = `oklch(0.72 0.13 ${accentHue})`;

	const subject =
		shape === 0
			? `<rect x="${offset - 70}" y="150" width="140" height="150" rx="18" fill="${body}"/><circle cx="${offset}" cy="130" r="${radius / 2}" fill="${accent}"/>`
			: shape === 1
				? `<circle cx="200" cy="${offset + 40}" r="${radius}" fill="${body}"/><rect x="170" y="${offset - radius - 20}" width="60" height="40" rx="8" fill="${accent}"/>`
				: `<path d="M110 300 L200 ${offset - 60} L290 300 Z" fill="${body}"/><rect x="120" y="290" width="160" height="16" rx="8" fill="${accent}"/>`;

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img"><rect width="400" height="400" fill="${backdrop}"/><rect y="300" width="400" height="100" fill="${floor}"/>${subject}</svg>`;
}
