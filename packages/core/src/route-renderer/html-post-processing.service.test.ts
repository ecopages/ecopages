import { describe, expect, it } from 'vitest';
import type { ProcessedAsset } from '../services/asset-processing-service/index.ts';
import { HtmlPostProcessingService } from './html-post-processing.service.ts';

describe('HtmlPostProcessingService', () => {
	const service = new HtmlPostProcessingService();

	it('should apply attributes to the html element', () => {
		const result = service.applyAttributesToHtmlElement('<!DOCTYPE html><html lang="en"><body>Hello</body></html>', {
			'data-eco-document-owner': 'react-router',
		});

		expect(result).toContain('<html lang="en" data-eco-document-owner="react-router">');
	});

	it('should apply attributes to the first body child', () => {
		const result = service.applyAttributesToFirstBodyElement(
			'<html><body><main>Hello</main><footer>Footer</footer></body></html>',
			{ 'data-eco-component-id': 'root-1', role: 'main' },
		);

		expect(result).toContain('<main data-eco-component-id="root-1" role="main">Hello</main>');
	});

	it('should apply attributes to the first fragment element', () => {
		const result = service.applyAttributesToFirstElement('   <aside>Content</aside><div>Other</div>', {
			'aria-live': 'polite',
		});

		expect(result).toContain('<aside aria-live="polite">Content</aside>');
	});

	it('should deduplicate processed assets while preserving order', () => {
		const first = { kind: 'script', srcUrl: '/assets/app.js', position: 'head' } as ProcessedAsset;
		const duplicate = { kind: 'script', srcUrl: '/assets/app.js', position: 'head' } as ProcessedAsset;
		const second = { kind: 'stylesheet', srcUrl: '/assets/app.css', position: 'head' } as ProcessedAsset;

		expect(service.dedupeProcessedAssets([first, duplicate, second])).toEqual([first, second]);
	});
});
