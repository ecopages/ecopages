import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { JsHmrStrategy, type JsHmrContext } from './js-hmr-strategy';
import { HmrStrategyType } from '../hmr-strategy';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TMP_DIR = path.join(os.tmpdir(), 'js-hmr-strategy-test');
const SRC_DIR = path.join(TMP_DIR, 'src');

function createMockContext(overrides: Partial<JsHmrContext> = {}): JsHmrContext {
	return {
		getWatchedFiles: () => new Map(),
		getSpecifierMap: () => new Map(),
		getDistDir: () => TMP_DIR,
		getPlugins: () => [],
		getSrcDir: () => SRC_DIR,
		...overrides,
	};
}

describe('JsHmrStrategy', () => {
	beforeAll(() => {
		fs.mkdirSync(SRC_DIR, { recursive: true });
	});

	afterAll(() => {
		fs.rmSync(TMP_DIR, { recursive: true, force: true });
	});

	describe('type', () => {
		it('has SCRIPT type', () => {
			const context = createMockContext();
			const strategy = new JsHmrStrategy(context);
			expect(strategy.type).toBe(HmrStrategyType.SCRIPT);
		});

		it('has default priority of 25', () => {
			const context = createMockContext();
			const strategy = new JsHmrStrategy(context);
			expect(strategy.priority).toBe(25);
		});
	});

	describe('matches', () => {
		it('returns false when no watched files are registered', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map(),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'app.ts'))).toBe(false);
		});

		it('returns true for .ts files in src directory when watched files exist', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'component.ts'))).toBe(true);
		});

		it('returns true for .tsx files in src directory', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'component.tsx'))).toBe(true);
		});

		it('returns true for .js files in src directory', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'utils.js'))).toBe(true);
		});

		it('returns true for .jsx files in src directory', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'component.jsx'))).toBe(true);
		});

		it('returns false for .css files', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'styles.css'))).toBe(false);
		});

		it('returns false for files outside src directory', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches('/other/path/file.ts')).toBe(false);
		});

		it('returns false for non-extension matches', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'data.json'))).toBe(false);
			expect(strategy.matches(path.join(SRC_DIR, 'readme.md'))).toBe(false);
		});
	});

	describe('process', () => {
		it('returns none when no watched files are registered', async () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map(),
			});
			const strategy = new JsHmrStrategy(context);

			const action = await strategy.process(path.join(SRC_DIR, 'app.ts'));

			expect(action.type).toBe('none');
		});
	});
});
