import path from 'node:path';
import { expect, test } from 'vitest';
import { assertDirectoryTarget, resolveChildDirectory } from './safe-directory.ts';

test('assertDirectoryTarget rejects dot segments and filesystem root', () => {
	expect(() => assertDirectoryTarget('.')).toThrow(/Refusing directory target/);
	expect(() => assertDirectoryTarget('..')).toThrow(/Refusing directory target/);
	expect(() => assertDirectoryTarget('/vault/.')).toThrow(/Refusing directory target/);
	expect(() => assertDirectoryTarget('/vault/..')).toThrow(/Refusing directory target/);
	expect(() => assertDirectoryTarget(path.parse(process.cwd()).root)).toThrow(/filesystem root/);
});

test('resolveChildDirectory keeps a named folder inside the parent', () => {
	expect(resolveChildDirectory('/vault', 'llm-wiki')).toBe(path.resolve('/vault/llm-wiki'));
});

test('resolveChildDirectory refuses a dot that would select the parent', () => {
	expect(() => resolveChildDirectory('/vault', '.')).toThrow(/Refusing directory name/);
	expect(() => resolveChildDirectory('/vault', '..')).toThrow(/Refusing directory name/);
	expect(() => resolveChildDirectory('/vault', 'nested/wiki')).toThrow(/Refusing directory name/);
});
