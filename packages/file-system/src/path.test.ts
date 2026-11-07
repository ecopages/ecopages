import { describe, expect, it } from 'vitest';
import { createPath } from './path.ts';

describe('createPath win32', () => {
	const path = createPath('win32');

	it('returns forward slashes from every path operation', () => {
		expect(path.join('D:\\app', 'src', 'page.tsx')).toBe('D:/app/src/page.tsx');
		expect(path.resolve('D:/app', 'src\\page.tsx')).toBe('D:/app/src/page.tsx');
		expect(path.dirname('D:\\app\\src\\page.tsx')).toBe('D:/app/src');
		expect(path.normalize('D:\\app\\src\\..\\dist')).toBe('D:/app/dist');
		expect(path.relative('D:/app', 'D:\\app\\src\\page.tsx')).toBe('src/page.tsx');
		expect(path.parse('D:\\app\\src\\page.tsx')).toEqual({
			root: 'D:/',
			dir: 'D:/app/src',
			base: 'page.tsx',
			ext: '.tsx',
			name: 'page',
		});
	});

	it('keeps the drive letter in upper case', () => {
		expect(path.fromNative('d:\\app\\src')).toBe('D:/app/src');
		expect(path.resolve('d:/app')).toBe('D:/app');
	});

	it('returns a path on another drive as absolute from relative', () => {
		expect(path.relative('C:/temp', 'D:/app/page.tsx')).toBe('D:/app/page.tsx');
		expect(path.isWithin('C:/temp', 'D:/app/page.tsx')).toBe(false);
	});

	it('tells whether a path is inside a directory', () => {
		expect(path.isWithin('D:/app', 'D:/app')).toBe(true);
		expect(path.isWithin('D:/app', 'd:\\app\\src\\page.tsx')).toBe(true);
		expect(path.isWithin('D:/app', 'D:/application/page.tsx')).toBe(false);
		expect(path.isWithin('D:/app/src', 'D:/app/page.tsx')).toBe(false);
	});

	it('converts file URLs in both directions', () => {
		expect(path.fromFileUrl('file:///d:/app/a%20b.ts')).toBe('D:/app/a b.ts');
		expect(path.toFileUrl('D:/app/a b.ts').href).toBe('file:///D:/app/a%20b.ts');
	});

	it('converts to the native form only on request', () => {
		expect(path.toNative('D:/app/src')).toBe('D:\\app\\src');
	});
});

describe('createPath posix', () => {
	const path = createPath('posix');

	it('behaves like node:path posix', () => {
		expect(path.join('/app', 'src', '..', 'dist')).toBe('/app/dist');
		expect(path.relative('/app', '/app/src/page.tsx')).toBe('src/page.tsx');
		expect(path.isWithin('/app', '/app/src')).toBe(true);
		expect(path.isWithin('/app', '/app-other')).toBe(false);
	});

	it('leaves backslashes alone, since they are file name characters on POSIX', () => {
		expect(path.fromNative('/app/a\\b')).toBe('/app/a\\b');
	});

	it('converts file URLs in both directions', () => {
		expect(path.fromFileUrl('file:///app/a%20b.ts')).toBe('/app/a b.ts');
		expect(path.toFileUrl('/app/a b.ts').href).toBe('file:///app/a%20b.ts');
	});
});
