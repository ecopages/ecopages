import { afterEach, describe, expect, it, vi } from 'vitest';
import * as prompts from '@clack/prompts';
import { createClackDefaultPrompt } from './port-manager-default-prompt.ts';

vi.mock('@clack/prompts', () => ({
	confirm: vi.fn(),
	isCancel: vi.fn(() => false),
}));

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe('createClackDefaultPrompt', () => {
	it('returns the explicit confirmation result', async () => {
		vi.mocked(prompts.confirm).mockResolvedValue(false);

		await expect(createClackDefaultPrompt()('Use another port?', 10_000)).resolves.toBe(false);
	});

	it('auto-approves and aborts the prompt after the timeout', async () => {
		vi.useFakeTimers();
		vi.mocked(prompts.confirm).mockImplementation(() => new Promise(() => {}));
		const prompt = createClackDefaultPrompt();

		const result = prompt('Use another port?', 10_000);
		await vi.advanceTimersByTimeAsync(10_000);

		await expect(result).resolves.toBe(true);
		const signal = vi.mocked(prompts.confirm).mock.calls[0]?.[0].signal;
		expect(signal?.aborted).toBe(true);
	});

	it('surfaces prompt failures before the timeout', async () => {
		vi.mocked(prompts.confirm).mockRejectedValue(new Error('terminal unavailable'));

		await expect(createClackDefaultPrompt()('Use another port?', 10_000)).rejects.toThrow('terminal unavailable');
	});
});
