import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	clearRadiantCustomElementDefinition,
	invalidateRadiantRegisteredScriptSsrRegistration,
	resolveRadiantCustomElementTag,
} from '../radiant-registered-script-ssr-invalidation.ts';

describe('resolveRadiantCustomElementTag', () => {
	it('reads the tag from @customElement decorators', () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'radiant-script-tag-'));
		const scriptPath = join(tempDir, 'theme-toggle.tsx');

		writeFileSync(scriptPath, `@customElement('theme-toggle')\nexport class ThemeToggle {}\n`, 'utf-8');

		try {
			expect(resolveRadiantCustomElementTag(scriptPath)).toBe('theme-toggle');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

describe('clearRadiantCustomElementDefinition', () => {
	it('deletes from browser-like registries', () => {
		const deleteSpy = vi.fn(() => true);
		const previousRegistry = (globalThis as { customElements?: unknown }).customElements;

		Object.assign(globalThis, {
			customElements: {
				get: () => class {},
				delete: deleteSpy,
			},
		});

		try {
			clearRadiantCustomElementDefinition('theme-toggle');
			expect(deleteSpy).toHaveBeenCalledWith('theme-toggle');
		} finally {
			(globalThis as { customElements?: unknown }).customElements = previousRegistry;
		}
	});

	it('deletes from Radiant light-DOM shim registries', () => {
		const definitions = new Map<string, unknown>([['theme-toggle', class {}]]);
		const previousRegistry = (globalThis as { customElements?: unknown }).customElements;

		Object.assign(globalThis, {
			customElements: {
				get: (name: string) => definitions.get(name),
				definitions,
			},
		});

		try {
			clearRadiantCustomElementDefinition('theme-toggle');
			expect(definitions.has('theme-toggle')).toBe(false);
		} finally {
			(globalThis as { customElements?: unknown }).customElements = previousRegistry;
		}
	});
});

describe('invalidateRadiantRegisteredScriptSsrRegistration', () => {
	it('clears the registry entry for registered Radiant script modules', () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'radiant-script-invalidate-'));
		const scriptPath = join(tempDir, 'widget.tsx');
		const definitions = new Map<string, unknown>([['widget', class {}]]);
		const previousRegistry = (globalThis as { customElements?: unknown }).customElements;

		writeFileSync(scriptPath, `@customElement('widget')\nexport class Widget {}\n`, 'utf-8');
		Object.assign(globalThis, {
			customElements: {
				get: (name: string) => definitions.get(name),
				definitions,
			},
		});

		try {
			expect(invalidateRadiantRegisteredScriptSsrRegistration(scriptPath)).toBe(true);
			expect(definitions.has('widget')).toBe(false);
		} finally {
			(globalThis as { customElements?: unknown }).customElements = previousRegistry;
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
