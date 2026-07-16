import { Suspense, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
	afterEach(() => {
		cleanup();
	});

	it('returns a browser lazy component that resolves through Suspense', async () => {
		const deferredImport = createDeferredImport<{
			default: () => ReactElement;
		}>();
		const DynamicComponent = dynamic(() => deferredImport.promise);

		render(
			<Suspense fallback={<span>Loading dynamic component</span>}>
				<DynamicComponent />
			</Suspense>,
		);

		expect(screen.getByText('Loading dynamic component')).toBeTruthy();

		deferredImport.resolve({
			default: () => <span>Dynamic content</span>,
		});

		expect(await screen.findByText('Dynamic content')).toBeTruthy();
		expect(screen.queryByText('Loading dynamic component')).toBeNull();
	});
});
