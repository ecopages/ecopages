import { describe, it, expect } from 'bun:test';
import { createMDXHydrationScript } from './hydration-scripts.ts';

describe('createMDXHydrationScript', () => {
	const importPath = '/assets/page-abc123.js';

	describe('development mode', () => {
		it('should include HMR handlers', () => {
			const script = createMDXHydrationScript({ importPath, isDevelopment: true });
			expect(script).toContain('window.__ecopages_hmr_handlers__');
		});

		it('should include the import path', () => {
			const script = createMDXHydrationScript({ importPath, isDevelopment: true });
			expect(script).toContain(importPath);
		});

		it('should use hydrateRoot from react-dom/client', () => {
			const script = createMDXHydrationScript({ importPath, isDevelopment: true });
			expect(script).toContain('import { hydrateRoot } from "react-dom/client"');
		});

		it('should use createElement from react', () => {
			const script = createMDXHydrationScript({ importPath, isDevelopment: true });
			expect(script).toContain('import { createElement } from "react"');
		});

		it('should import MDX component as namespace', () => {
			const script = createMDXHydrationScript({ importPath, isDevelopment: true });
			expect(script).toContain(`import * as MDXComponent from "${importPath}"`);
		});

		it('should handle layout from config', () => {
			const script = createMDXHydrationScript({ importPath, isDevelopment: true });
			expect(script).toContain('resolvedLayout');
			expect(script).toContain('config?.layout');
		});

		it('should register HMR handler with import path', () => {
			const script = createMDXHydrationScript({ importPath, isDevelopment: true });
			expect(script).toContain(`window.__ecopages_hmr_handlers__["${importPath}"]`);
		});

		it('should log MDX component update on HMR', () => {
			const script = createMDXHydrationScript({ importPath, isDevelopment: true });
			expect(script).toContain('[ecopages] MDX component updated');
		});
	});

	describe('production mode', () => {
		it('should NOT include HMR handlers', () => {
			const script = createMDXHydrationScript({ importPath, isDevelopment: false });
			expect(script).not.toContain('window.__ecopages_hmr_handlers__');
		});

		it('should include the import path', () => {
			const script = createMDXHydrationScript({ importPath, isDevelopment: false });
			expect(script).toContain(importPath);
		});

		it('should use hydrateRoot from react-dom/client', () => {
			const script = createMDXHydrationScript({ importPath, isDevelopment: false });
			expect(script).toContain('import { hydrateRoot } from "react-dom/client"');
		});

		it('should use createElement from react', () => {
			const script = createMDXHydrationScript({ importPath, isDevelopment: false });
			expect(script).toContain('import { createElement } from "react"');
		});

		it('should import MDX component as namespace', () => {
			const script = createMDXHydrationScript({ importPath, isDevelopment: false });
			expect(script).toContain(`import * as MDXComponent from "${importPath}"`);
		});

		it('should handle layout from config', () => {
			const script = createMDXHydrationScript({ importPath, isDevelopment: false });
			expect(script).toContain('resolvedLayout');
			expect(script).toContain('config?.layout');
		});

		it('should use DOMContentLoaded event for production', () => {
			const script = createMDXHydrationScript({ importPath, isDevelopment: false });
			expect(script).toContain('DOMContentLoaded');
		});
	});
});
