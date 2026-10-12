import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearNavigationHtmlCache } from '@ecopages/core/router/navigation-pipeline';
import { PrefetchManager } from '../src/client/services/prefetch-manager.ts';

afterEach(() => {
	clearNavigationHtmlCache();
	vi.restoreAllMocks();
});

describe('PrefetchManager', () => {
	it('requests prefetched HTML with low network priority', async () => {
		const response = new Response('<html><head></head><body></body></html>', {
			headers: { 'Content-Type': 'text/html' },
		});
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
		const manager = new PrefetchManager({ strategy: 'hover' });

		await manager.prefetch(new URL('/prefetch-priority', window.location.href).href);

		expect(fetchMock).toHaveBeenCalledWith(
			new URL('/prefetch-priority', window.location.href).href,
			expect.objectContaining({ priority: 'low' }),
		);
	});
});
