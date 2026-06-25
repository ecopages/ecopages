import { expect } from '@playwright/test';
import type { Locator } from 'playwright-core';

type CounterExpectations = {
	kita?: string | false;
	lit?: string | false;
	react?: string | false;
};

async function waitForNextPaint(target: Locator) {
	try {
		await target.evaluate(
			() =>
				new Promise<void>((resolve) => {
					requestAnimationFrame(() => {
						requestAnimationFrame(() => resolve());
					});
				}),
		);
	} catch {
		return;
	}
}

async function clickCounter(button: Locator) {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			await expect(button).toBeVisible();
			await button.scrollIntoViewIfNeeded().catch(() => undefined);
			await button.click({ noWaitAfter: true, timeout: 5000 });
			return;
		} catch (error) {
			if (attempt === 2) {
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
}

async function waitForLitCounterReady(counter: Locator) {
	await expect(counter).toHaveCount(1);
	await expect
		.poll(
			() =>
				counter.evaluate(async (element) => {
					const litElement = element as HTMLElement & {
						updateComplete?: Promise<unknown>;
						shadowRoot: ShadowRoot | null;
					};
					const LitCounter = customElements.get('lit-counter');

					if (!LitCounter || !(litElement instanceof LitCounter)) {
						return false;
					}

					await litElement.updateComplete;

					if (!litElement.shadowRoot?.querySelector('[data-lit-value]')) {
						await new Promise<void>((resolve) => {
							requestAnimationFrame(() => resolve());
						});
					}

					return Boolean(litElement.shadowRoot?.querySelector('[data-lit-value]'));
				}),
			{
				intervals: [100, 200, 350, 500],
				timeout: 5000,
			},
		)
		.toBe(true);
}

async function readLitCounterValue(counter: Locator) {
	return counter.evaluate((element) => {
		const litElement = element as HTMLElement & { shadowRoot: ShadowRoot | null };
		return litElement.shadowRoot?.querySelector('[data-lit-value]')?.textContent?.trim() ?? '';
	});
}

async function clickLitCounterIncrement(counter: Locator) {
	await counter.evaluate((element) => {
		const litElement = element as HTMLElement & { shadowRoot: ShadowRoot | null };
		litElement.shadowRoot?.querySelector<HTMLButtonElement>('[data-lit-inc]')?.click();
	});
}

async function incrementLitCounter(counter: Locator, expectedValue: string) {
	await waitForLitCounterReady(counter);
	await expect
		.poll(
			async () => {
				await clickLitCounterIncrement(counter);
				await waitForNextPaint(counter);
				return readLitCounterValue(counter);
			},
			{
				intervals: [100, 200, 350, 500],
				timeout: 5000,
			},
		)
		.toBe(expectedValue);
}

export async function incrementCounter(button: Locator, value: Locator, expectedValue: string) {
	await expect
		.poll(
			async () => {
				await clickCounter(button);
				await waitForNextPaint(value);
				return ((await value.textContent()) ?? '').trim();
			},
			{
				intervals: [100, 200, 350, 500],
				timeout: 5000,
			},
		)
		.toBe(expectedValue);
}

export async function assertCounterInteractivity(root: Locator, expectations: CounterExpectations = {}) {
	const kitaValue = root.locator('[data-kita-value]');
	const litCounter = root.locator('lit-counter[data-counter-kind="lit"]');
	const reactValue = root.locator('[data-react-value]');

	if (expectations.kita !== false) {
		const initialKita = expectations.kita ?? '0';
		await expect(kitaValue).toHaveText(initialKita);
		await incrementCounter(root.locator('[data-kita-inc]'), kitaValue, String(Number(initialKita) + 1));
	}

	if (expectations.lit !== false) {
		const initialLit = expectations.lit ?? '0';
		await waitForLitCounterReady(litCounter);
		await expect.poll(() => readLitCounterValue(litCounter), { timeout: 5000 }).toBe(initialLit);
		await incrementLitCounter(litCounter, String(Number(initialLit) + 1));
	}

	if (expectations.react !== false) {
		const initialReact = expectations.react ?? '0';
		await expect(reactValue).toHaveText(initialReact);
		await incrementCounter(root.locator('[data-react-inc]'), reactValue, String(Number(initialReact) + 1));
	}
}

export async function assertRadiantCounterInteractivity(counter: Locator, initialValue = '0') {
	const value = counter.locator('[data-radiant-value]');
	const increment = counter.locator('[data-radiant-inc]');

	await expect(counter).toBeVisible();
	await expect(value).toHaveText(initialValue);
	await incrementCounter(increment, value, String(Number(initialValue) + 1));
}

export async function assertFourCountersVisible(root: Locator) {
	const kitaCounter = root.locator('[data-kita-counter]');
	const litCounter = root.locator('lit-counter[data-counter-kind="lit"]');
	const reactCounter = root.locator('[data-react-counter]');
	const radiantCounter = root.locator('radiant-counter[data-radiant-counter]');

	await expect(root).toBeVisible();
	await root.scrollIntoViewIfNeeded().catch(() => undefined);
	await waitForNextPaint(root);

	await expect(kitaCounter).toHaveCount(1);
	await waitForLitCounterReady(litCounter);
	await expect(reactCounter).toHaveCount(1);
	await expect(radiantCounter).toHaveCount(1);

	await expect(kitaCounter).toBeVisible();
	await expect.poll(() => readLitCounterValue(litCounter), { timeout: 5000 }).not.toBe('');
	await expect(litCounter).toBeVisible();
	await expect(reactCounter).toBeVisible();
	await expect(radiantCounter).toBeVisible();
}

export async function assertAllCountersInteractivity(
	root: Locator,
	options?: CounterExpectations & { radiant?: string },
) {
	await assertFourCountersVisible(root);
	await assertCounterInteractivity(root, options);
	await assertRadiantCounterInteractivity(root.locator('radiant-counter').first(), options?.radiant ?? '0');
}
