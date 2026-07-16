import { describe, expect, it } from 'vitest';
import { hasSingleRootElement } from './html-boundary.ts';

describe('hasSingleRootElement', () => {
	it('returns true for a single normal root element', () => {
		expect(hasSingleRootElement('<div><span>Hello</span></div>')).toBe(true);
	});

	it('returns false for sibling root elements', () => {
		expect(hasSingleRootElement('<span>One</span><span>Two</span>')).toBe(false);
	});

	it('returns true for a single self-closing root', () => {
		expect(hasSingleRootElement('<custom-element />')).toBe(true);
	});

	it('returns true for a single void root tag', () => {
		expect(hasSingleRootElement('<img src="/a.png">')).toBe(true);
	});

	it('returns false for non-element output', () => {
		expect(hasSingleRootElement('plain text')).toBe(false);
	});

	it('returns true when only trailing whitespace follows root', () => {
		expect(hasSingleRootElement('<section>Body</section>   \n')).toBe(true);
	});

	it('returns false when another element follows closing root', () => {
		expect(hasSingleRootElement('<section>Body</section><footer>x</footer>')).toBe(false);
	});
});
