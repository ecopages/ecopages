import { describe, expect, test } from 'bun:test';
import {
  defaultValueForType,
  parseAttributeTypeConstant,
  parseAttributeTypeDefault,
  readAttributeValue,
  writeAttributeValue,
} from '@/utils/attribute-utils';

describe('readAttributeValue', async () => {
  test.each([
    ['true', true],
    ['1', true],
    ['0', false],
  ])('%p should be parsed as %p', (a, b) => {
    const read = readAttributeValue(a, Boolean);
    expect(read).toBe(b);
  });

  test.each([
    ['1', 1],
    ['1_000', 1000],
    ['1_000_000', 1000000],
  ])('%p should be parsed as %p', (a, b) => {
    const read = readAttributeValue(a, Number);
    expect(read).toBe(b);
  });

  test.each([
    ['hello', 'hello'],
    ['', ''],
  ])('%p should be parsed as %p', (a, b) => {
    const read = readAttributeValue(a, String);
    expect(read).toBe(b);
  });

  test.each([
    ['{"hello":"world"}', { hello: 'world' }],
    ['{}', {}],
  ])('%p should be parsed as %p', (a, b) => {
    const read = readAttributeValue(a, Object);
    expect(read).toEqual(b);
  });

  test.each([
    ['["hello","world"]', ['hello', 'world']],
    ['[]', []],
  ])('%p should be parsed as %p', (a, b) => {
    const read = readAttributeValue(a, Array);
    expect(read).toEqual(b);
  });

  test.each([
    [1, Array],
    [1, Object],
    ['1', Array],
    ['1', Object],
    [{}, Number],
    [[], Number],
  ])('%p should throw %p', (a, b) => {
    const read = () => readAttributeValue(a as any, b);
    expect(read).toThrow();
  });
});

describe('writeAttributeValue', async () => {
  test.each([
    [true, 'true'],
    [false, 'false'],
  ])('%p should be written as %p', (a, b) => {
    const write = writeAttributeValue(a, Boolean);
    expect(write).toBe(b);
  });

  test.each([
    [1, '1'],
    [1000, '1000'],
    [1000000, '1000000'],
  ])('%p should be written as %p', (a, b) => {
    const write = writeAttributeValue(a, Number);
    expect(write).toBe(b);
  });

  test.each([
    ['hello', 'hello'],
    ['', ''],
  ])('%p should be written as %p', (a, b) => {
    const write = writeAttributeValue(a, String);
    expect(write).toBe(b);
  });

  test.each([
    [{ hello: 'world' }, '{"hello":"world"}'],
    [{}, '{}'],
  ])('%p should be written as %p', (a, b) => {
    const write = writeAttributeValue(a, Object);
    expect(write).toBe(b);
  });

  test.each([
    [['hello', 'world'], '["hello","world"]'],
    [[], '[]'],
  ])('%p should be written as %p', (a, b) => {
    const write = writeAttributeValue(a, Array);
    expect(write).toBe(b);
  });
});

describe('parseAttributeTypeDefault', async () => {
  test.each([
    [true, 'boolean'],
    [1, 'number'],
    ['hello', 'string'],
    [{ hello: 'world' }, 'object'],
    [['hello', 'world'], 'array'],
  ])('%p should be parsed as %p', (a, b) => {
    const parsed = parseAttributeTypeDefault(a);
    expect(parsed).toBe(b);
  });
});

describe('parseAttributeTypeConstant', async () => {
  test.each([
    [Boolean, 'boolean'],
    [Number, 'number'],
    [String, 'string'],
    [Object, 'object'],
    [Array, 'array'],
  ])('%p should be parsed as %p', (a, b) => {
    const parsed = parseAttributeTypeConstant(a);
    expect(parsed).toBe(b);
  });
});

describe('defaultValueForType', async () => {
  test.each([
    [Boolean, false],
    [Number, 0],
    [String, ''],
    [Object, null],
    [Array, null],
  ])('%p should be parsed as %p', (a, b) => {
    const parsed = defaultValueForType(a);
    expect(parsed).toBe(b);
  });
});
