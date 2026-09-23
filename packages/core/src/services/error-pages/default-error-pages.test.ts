import { afterEach, describe, expect, it } from 'vitest';
import {
	buildDefaultNotFoundHtml,
	buildDefaultServerErrorHtml,
	DEFAULT_ERROR_PAGE_CLASS_NAMES,
} from './default-error-pages.ts';

describe('default error pages', () => {
	const originalNodeEnv = process.env.NODE_ENV;

	afterEach(() => {
		if (originalNodeEnv === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = originalNodeEnv;
		}
	});

	it('builds a basic not-found page', () => {
		const html = buildDefaultNotFoundHtml();
		expect(html).toContain('eco-error-page__title">Not Found</h1>');
		expect(html).toContain(DEFAULT_ERROR_PAGE_CLASS_NAMES.root);
		expect(html).toContain(DEFAULT_ERROR_PAGE_CLASS_NAMES.notFoundModifier);
		expect(html).toContain('<!DOCTYPE html>');
	});

	it('omits error details and copy affordance in production', () => {
		process.env.NODE_ENV = 'production';
		const html = buildDefaultServerErrorHtml({
			message: 'secret failure',
			stack: 'Error: secret failure\n    at handler',
		});
		expect(html).toContain('eco-error-page__title">Something went wrong</h1>');
		expect(html).not.toContain('secret failure');
		expect(html).not.toContain('Copy error');
	});

	it('includes copy affordance and escaped details in development', () => {
		process.env.NODE_ENV = 'development';
		const html = buildDefaultServerErrorHtml({
			message: 'render <failed>',
			stack: 'Error: render <failed>',
		});
		expect(html).toContain('Copy error');
		expect(html).toContain(DEFAULT_ERROR_PAGE_CLASS_NAMES.copyIconClipboard);
		expect(html).toContain(DEFAULT_ERROR_PAGE_CLASS_NAMES.copyButtonCopied);
		expect(html).toContain('Copied');
		expect(html).toContain('render &lt;failed&gt;');
		expect(html).toContain('Error: render &lt;failed&gt;');
	});

	it('does not place error-controlled text inside executable script source', () => {
		process.env.NODE_ENV = 'development';
		const html = buildDefaultServerErrorHtml({ message: '</script><script>globalThis.injected = true</script>' });

		expect(html).not.toContain('</script><script>globalThis.injected = true</script>');
		expect(html).toContain('&lt;/script&gt;&lt;script&gt;globalThis.injected = true&lt;/script&gt;');
	});
});
