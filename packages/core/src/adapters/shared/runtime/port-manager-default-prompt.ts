import { confirm, isCancel } from '@clack/prompts';
import type { PromptFunction } from './port-manager.ts';

/**
 * Interactive yes/no prompt backed by `@clack/prompts`, with auto-approve after
 * `timeoutMs` when the user does not answer.
 */
export function createClackDefaultPrompt(): PromptFunction {
	return async (message: string, timeoutMs: number) => {
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout> | undefined;

		try {
			const timeout = new Promise<boolean>((resolve) => {
				timer = setTimeout(() => {
					controller.abort();
					resolve(true);
				}, timeoutMs);
			});

			const answered = (async () => {
				try {
					const result = await confirm({
						message,
						initialValue: true,
						signal: controller.signal,
					});

					return isCancel(result) ? false : result;
				} catch (error) {
					if (controller.signal.aborted) {
						return true;
					}

					throw error;
				}
			})();

			return await Promise.race([timeout, answered]);
		} finally {
			if (timer !== undefined) {
				clearTimeout(timer);
			}
		}
	};
}
