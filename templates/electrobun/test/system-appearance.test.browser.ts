import { expect, test } from 'vitest';
import { commands } from 'vitest/browser';
import { systemAppearanceScript } from '../src/lib/system-appearance';
import '../src/layouts/shell-layout/shell-layout.css';

declare module 'vitest/browser' {
	interface BrowserCommands {
		setColorScheme: (colorScheme: 'light' | 'dark' | null) => Promise<void>;
	}
}

test('uses the system palette on startup and switches without reloading', async () => {
	const root = document.documentElement;
	root.dataset.ruiTheme = 'zed';
	const script = document.createElement('script');
	script.textContent = systemAppearanceScript;
	const colorScheme = () => getComputedStyle(root).colorScheme;
	const background = () => getComputedStyle(root).backgroundColor;

	try {
		await commands.setColorScheme('dark');
		document.head.append(script);
		expect(colorScheme()).toBe('dark');
		const darkBackground = background();

		await commands.setColorScheme('light');
		await expect.poll(colorScheme).toBe('light');
		expect(background()).not.toBe(darkBackground);

		await commands.setColorScheme('dark');
		await expect.poll(background).toBe(darkBackground);
	} finally {
		await commands.setColorScheme(null);
		script.remove();
		delete root.dataset.ruiTheme;
	}
});
