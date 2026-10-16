import { expect, type ConsoleMessage, type Page } from '@playwright/test';

const runtimeErrorPatterns = [
	/is not defined/i,
	/Invalid hook call/i,
	/Cannot read properties of null \(reading 'useState'\)/i,
	/Cannot read properties of undefined/i,
	/Cannot set properties of null/i,
	/Missing props reference/i,
	/Failed to execute 'appendChild'/i,
	/Hydration failed/i,
	/Failed to resolve module specifier/i,
] as const;

const forbiddenHmrDiagnosticPatterns = [
	/HMR script registration failed/i,
	/Timed out registering entrypoint/i,
	/stale-output skips/i,
	/unhandled rejection/i,
	/missing runtime output/i,
] as const;

export function assertNoForbiddenHmrDiagnostics(messages: readonly string[]) {
	const combined = messages.join('\n');
	for (const pattern of forbiddenHmrDiagnosticPatterns) {
		expect(pattern.test(combined), `forbidden HMR diagnostic matched ${pattern}`).toBe(false);
	}
}

export function trackRuntimeErrors(page: Page) {
	const pageErrors: string[] = [];
	const consoleErrors: string[] = [];
	const consoleMessages: string[] = [];

	page.on('pageerror', (error: Error) => {
		pageErrors.push(error.message);
	});

	page.on('console', (message: ConsoleMessage) => {
		const text = message.text();
		consoleMessages.push(text);
		if (message.type() === 'error') consoleErrors.push(text);
	});

	return {
		pageErrors,
		consoleErrors,
		consoleMessages,
		assertClean() {
			const combinedErrors = `${pageErrors.join('\n')}\n${consoleErrors.join('\n')}`;
			for (const pattern of runtimeErrorPatterns) {
				expect(
					pattern.test(combinedErrors),
					`runtime errors should not match ${pattern}: ${combinedErrors}`,
				).toBe(false);
			}
			assertNoForbiddenHmrDiagnostics(consoleMessages);
		},
	};
}
