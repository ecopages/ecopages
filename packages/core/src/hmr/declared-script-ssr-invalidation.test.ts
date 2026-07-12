import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	clearRegisteredCustomElementDefinition,
	invalidateDeclaredScriptSsrRegistration,
	resolveDeclaredScriptCustomElementTag,
} from './declared-script-ssr-invalidation.ts';

describe('resolveDeclaredScriptCustomElementTag', () => {
	it('reads the tag from @customElement decorators', () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'declared-script-tag-'));
		const scriptPath = join(tempDir, 'theme-toggle.script.tsx');

		writeFileSync(scriptPath, `@customElement('theme-toggle')\nexport class ThemeToggle {}\n`, 'utf-8');

		try {
			expect(resolveDeclaredScriptCustomElementTag(scriptPath)).toBe('theme-toggle');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

describe('clearRegisteredCustomElementDefinition', () => {
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
			clearRegisteredCustomElementDefinition('theme-toggle');
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
			clearRegisteredCustomElementDefinition('theme-toggle');
			expect(definitions.has('theme-toggle')).toBe(false);
		} finally {
			(globalThis as { customElements?: unknown }).customElements = previousRegistry;
		}
	});
});

describe('invalidateDeclaredScriptSsrRegistration', () => {
	it('clears the registry entry for declared script entrypoints', () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'declared-script-invalidate-'));
		const scriptPath = join(tempDir, 'widget.script.tsx');
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
			invalidateDeclaredScriptSsrRegistration(scriptPath);
			expect(definitions.has('widget')).toBe(false);
		} finally {
			(globalThis as { customElements?: unknown }).customElements = previousRegistry;
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
