import { Suspense, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { dynamic } from './dynamic.ts';

function createDeferredImport<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((innerResolve) => {
		resolve = innerResolve;
	});

	return {
		promise,
		resolve,
	};
}

describe('dynamic', () => {
	let container: HTMLDivElement;
	let root: Root;

	afterEach(() => {
		root.unmount();
		container.remove();
	});

	it('returns a browser lazy component that resolves through Suspense', async () => {
		const deferredImport = createDeferredImport<{
			default: () => ReactElement;
		}>();
		const DynamicComponent = dynamic(() => deferredImport.promise);

		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
		root.render(
			<Suspense fallback={<span>Loading dynamic component</span>}>
				<DynamicComponent />
			</Suspense>,
		);

		await expect.element(page.getByText('Loading dynamic component')).toBeInTheDocument();

		deferredImport.resolve({
			default: () => <span>Dynamic content</span>,
		});

		await expect.element(page.getByText('Dynamic content')).toBeInTheDocument();
		await expect.element(page.getByText('Loading dynamic component')).not.toBeInTheDocument();
	});
});
