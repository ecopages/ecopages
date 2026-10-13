import type { Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { gotoAndWait, waitForPageReady } from '../utils/test-helpers.ts';

describe('E2E test helpers', () => {
	it('propagates page readiness failures', async () => {
		const readinessError = new Error('readiness failed');
		const page = {
			waitForLoadState: vi.fn().mockRejectedValue(readinessError),
			waitForFunction: vi.fn().mockResolvedValue(undefined),
		} as unknown as Page;

		await expect(waitForPageReady(page)).rejects.toThrow(readinessError);
		expect(page.waitForFunction).not.toHaveBeenCalled();
	});

	it('propagates DOM readiness failures', async () => {
		const readinessError = new Error('DOM readiness failed');
		const page = {
			waitForLoadState: vi.fn().mockResolvedValue(undefined),
			waitForFunction: vi.fn().mockRejectedValue(readinessError),
		} as unknown as Page;

		await expect(waitForPageReady(page)).rejects.toThrow(readinessError);
		expect(page.waitForFunction).toHaveBeenCalledOnce();
	});

	it('attempts a transiently failed navigation only once', async () => {
		const navigationError = new Error('net::ERR_CONNECTION_RESET');
		const page = {
			goto: vi.fn().mockRejectedValue(navigationError),
		} as unknown as Page;

		await expect(gotoAndWait(page, '/target')).rejects.toThrow(navigationError);
		expect(page.goto).toHaveBeenCalledOnce();
	});
});
