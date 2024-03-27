import {
  parseAttributeTypeConstant,
  parseAttributeTypeDefault,
  readAttributeValue,
  writeAttributeValue,
} from "@/lib/lite/utils";
import { describe, expect, test } from "bun:test";

describe("readAttributeValue", async () => {
  test.each([
    ["true", true],
    ["1", true],
    ["0", false],
  ])("readAttributeValue: correctly reads booleans", (a, b) => {
    const read = readAttributeValue(a, Boolean);
    expect(read).toBe(b);
  });

  test.each([
    ["1", 1],
    ["1_000", 1000],
    ["1_000_000", 1000000],
  ])("readAttributeValue: correctly reads numbers", (a, b) => {
    const read = readAttributeValue(a, Number);
    expect(read).toBe(b);
  });

  test.each([
    ["hello", "hello"],
    ["", ""],
  ])("readAttributeValue: correctly reads strings", (a, b) => {
    const read = readAttributeValue(a, String);
    expect(read).toBe(b);
  });

  test.each([
    ['{"hello":"world"}', { hello: "world" }],
    ["{}", {}],
  ])("readAttributeValue: correctly reads objects", (a, b) => {
    const read = readAttributeValue(a, Object);
    expect(read).toEqual(b);
  });

  test.each([
    ['["hello","world"]', ["hello", "world"]],
    ["[]", []],
  ])("readAttributeValue: correctly reads arrays", (a, b) => {
    const read = readAttributeValue(a, Array);
    expect(read).toEqual(b);
  });

  test.each([
    [true, "true"],
    [false, "false"],
  ])("writeAttributeValue: correctly writes booleans", (a, b) => {
    const write = writeAttributeValue(a, Boolean);
    expect(write).toBe(b);
  });

  test.each([
    [1, "1"],
    [1000, "1000"],
    [1000000, "1000000"],
  ])("writeAttributeValue: correctly writes numbers", (a, b) => {
    const write = writeAttributeValue(a, Number);
    expect(write).toBe(b);
  });

  test.each([
    ["hello", "hello"],
    ["", ""],
  ])("writeAttributeValue: correctly writes strings", (a, b) => {
    const write = writeAttributeValue(a, String);
    expect(write).toBe(b);
  });

  test.each([
    [{ hello: "world" }, '{"hello":"world"}'],
    [{}, "{}"],
  ])("writeAttributeValue: correctly writes objects", (a, b) => {
    const write = writeAttributeValue(a, Object);
    expect(write).toBe(b);
  });

  test.each([
    [["hello", "world"], '["hello","world"]'],
    [[], "[]"],
  ])("writeAttributeValue: correctly writes arrays", (a, b) => {
    const write = writeAttributeValue(a, Array);
    expect(write).toBe(b);
  });

  test.each([
    [true, "boolean"],
    [1, "number"],
    ["hello", "string"],
    [{ hello: "world" }, "object"],
    [["hello", "world"], "array"],
  ])("parseAttributeTypeDefault: correctly parses the default value type", (a, b) => {
    const parsed = parseAttributeTypeDefault(a);
    expect(parsed).toBe(b);
  });

  test.each([
    [Boolean, "boolean"],
    [Number, "number"],
    [String, "string"],
    [Object, "object"],
    [Array, "array"],
  ])("parseAttributeTypeConstant: correctly parses the value type", (a, b) => {
    const parsed = parseAttributeTypeConstant(a);
    expect(parsed).toBe(b);
  });
});
