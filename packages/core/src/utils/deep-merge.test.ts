import { describe, expect, it } from 'bun:test';
import { deepMerge } from './deep-merge';

describe('deepMerge', () => {
  it('should merge two objects with nested properties', () => {
    const target = { a: 1, b: { c: 2 } };
    const source = { b: { d: 3 }, e: 4 };
    const expected = { a: 1, b: { c: 2, d: 3 }, e: 4 };
    const result = deepMerge(target, source);
    expect(result).toEqual(expected);
  });

  it('should merge two objects with overlapping properties', () => {
    const target = { a: 1, b: 2 };
    const source = { b: 3, c: 4 };
    const expected = { a: 1, b: 3, c: 4 };
    const result = deepMerge(target, source);
    expect(result).toEqual(expected);
  });

  it('should merge two objects with arrays', () => {
    const target = { a: [1, 2], b: { c: [3, 4] } };
    const source = { a: [5, 6], b: { c: [7, 8] } };
    const expected = { a: [1, 2, 5, 6], b: { c: [3, 4, 7, 8] } };
    const result = deepMerge(target, source);
    expect(result).toEqual(expected);
  });

  it('should merge two objects with nested objects', () => {
    const target = { a: { b: 1, c: 2 }, d: 3 };
    const source = { a: { c: 3, d: 4 }, e: 5 };
    const expected = { a: { b: 1, c: 3, d: 4 }, d: 3, e: 5 };
    const result = deepMerge(target, source);
    expect(result).toEqual(expected);
  });

  it('should overwrite non-object properties in the target', () => {
    const target = { a: 1, b: 2 };
    const source = { a: 3, c: 4 };
    const expected = { a: 3, b: 2, c: 4 };
    const result = deepMerge(target, source);
    expect(result).toEqual(expected);
  });

  it('should add properties from the source that are not in the target', () => {
    const target = { a: 1 };
    const source = { b: 2 };
    const expected = { a: 1, b: 2 };
    const result = deepMerge(target, source);
    expect(result).toEqual(expected);
  });

  it('should return an empty object when both inputs are empty', () => {
    const target = {};
    const source = {};
    const expected = {};
    const result = deepMerge(target, source);
    expect(result).toEqual(expected);
  });

  it('should ignore properties in the source that are undefined', () => {
    const target = { a: 1, b: 2 };
    const source = { a: undefined, c: 3 } as Partial<typeof target>;
    const expected = { a: 1, b: 2, c: 3 };
    const result = deepMerge(target, source);
    expect(result).toEqual(expected);
  });

  it('should merge dependencies', () => {
    const depsA = {
      stylesheets: ['/components/lite-counter/lite-counter.css'],
      scripts: ['/components/lite-counter/lite-counter.script.ts'],
    };

    const depsB = {
      stylesheets: [
        '/layouts/docs-layout/docs-layout.css',
        '/layouts/base-layout/base-layout.css',
        '/components/header/header.css',
        '/components/navigation/navigation.css',
        '/components/logo/logo.css',
        '/components/code-block/code-block.css',
      ],
      scripts: ['/layouts/base-layout/base-layout.script.ts'],
    };

    const expected = {
      stylesheets: [
        '/components/lite-counter/lite-counter.css',
        '/layouts/docs-layout/docs-layout.css',
        '/layouts/base-layout/base-layout.css',
        '/components/header/header.css',
        '/components/navigation/navigation.css',
        '/components/logo/logo.css',
        '/components/code-block/code-block.css',
      ],
      scripts: ['/components/lite-counter/lite-counter.script.ts', '/layouts/base-layout/base-layout.script.ts'],
    };

    const result = deepMerge(depsA, depsB);
    expect(result).toEqual(expected);
  });

  it('should merge two arrays', () => {
    const target = [1, 2, 3];
    const source = [4, 5, 6];
    const expected = [1, 2, 3, 4, 5, 6];
    const result = deepMerge(target, source);
    expect(result).toEqual(expected);
  });
});
