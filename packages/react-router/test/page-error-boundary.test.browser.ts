import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PageErrorBoundary } from '../src/page-error-boundary.ts';
import { renderAndFlushEffects } from './react-router.harness.ts';

function Throwing(): never {
	throw new Error('chunk failed');
}

describe('PageErrorBoundary', () => {
	let container: HTMLDivElement;
	let root: Root;
	const uncaught: unknown[] = [];

	beforeEach(() => {
		uncaught.length = 0;
		vi.spyOn(console, 'error').mockImplementation(() => {});
		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container, { onUncaughtError: (error) => uncaught.push(error) });
	});

	afterEach(() => {
		root.unmount();
		container.remove();
		vi.restoreAllMocks();
	});

	it('reloads the document once and renders nothing when the page throws after a navigation', async () => {
		const reloadDocument = vi.fn();

		await renderAndFlushEffects(() =>
			root.render(
				createElement(
					PageErrorBoundary,
					{ hasNavigated: () => true, reloadDocument },
					createElement('p', null, 'kept'),
					createElement(Throwing),
				),
			),
		);

		expect(reloadDocument).toHaveBeenCalledTimes(1);
		expect(container.textContent).toBe('');
		expect(uncaught).toEqual([]);
	});

	it('leaves an error before any navigation to React and does not reload', async () => {
		const reloadDocument = vi.fn();

		await expect(
			renderAndFlushEffects(() =>
				root.render(
					createElement(
						PageErrorBoundary,
						{ hasNavigated: () => false, reloadDocument },
						createElement(Throwing),
					),
				),
			),
		).rejects.toThrow('chunk failed');

		expect(reloadDocument).not.toHaveBeenCalled();
	});
});
