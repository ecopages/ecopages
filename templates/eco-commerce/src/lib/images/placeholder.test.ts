import { describe, expect, test } from 'vitest';
import { renderPlaceholderSvg } from './placeholder.ts';

describe('renderPlaceholderSvg', () => {
	test('draws the same image for the same seed', () => {
		expect(renderPlaceholderSvg('alder-oak-lounge-chair')).toBe(renderPlaceholderSvg('alder-oak-lounge-chair'));
	});

	test('draws different images for different seeds', () => {
		expect(renderPlaceholderSvg('alder-oak-lounge-chair')).not.toBe(renderPlaceholderSvg('birch-ash-stool'));
	});

	test('is a small, square SVG document', () => {
		const svg = renderPlaceholderSvg('alder-oak-lounge-chair');

		expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
		expect(svg).toContain('viewBox="0 0 400 400"');
		expect(svg.endsWith('</svg>')).toBe(true);
		expect(svg.length).toBeLessThan(1500);
	});
});
