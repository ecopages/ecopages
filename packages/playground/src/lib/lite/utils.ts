import type { AttributeTypeConstant, AttributeTypeDefault } from "./types";

export function parseAttributeTypeConstant(constant?: AttributeTypeConstant) {
  switch (constant) {
    case Array:
      return "array";
    case Boolean:
      return "boolean";
    case Number:
      return "number";
    case Object:
      return "object";
    case String:
      return "string";
  }
}

export function parseAttributeTypeDefault(defaultValue?: AttributeTypeDefault) {
  switch (typeof defaultValue) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "string":
      return "string";
  }

  if (Array.isArray(defaultValue)) return "array";
  if (Object.prototype.toString.call(defaultValue) === "[object Object]") return "object";
}

type Reader = (value: string) => any;

const readers: { [type: string]: Reader } = {
  array(value: string): any[] {
    const array = JSON.parse(value);
    if (!Array.isArray(array)) {
      throw new TypeError(
        `expected value of type "array" but instead got value "${value}" of type "${parseAttributeTypeDefault(
          array
        )}"`
      );
    }
    return array;
  },

  boolean(value: string): boolean {
    return !(value == "0" || String(value).toLowerCase() == "false");
  },

  number(value: string): number {
    return Number(value.replace(/_/g, ""));
  },

  object(value: string): object {
    const object = JSON.parse(value);
    if (object === null || typeof object != "object" || Array.isArray(object)) {
      throw new TypeError(
        `expected value of type "object" but instead got value "${value}" of type "${parseAttributeTypeDefault(
          object
        )}"`
      );
    }
    return object;
  },

  string(value: string): string {
    return value;
  },
};

type Writer = (value: any) => string;

const writers: { [type: string]: Writer } = {
  default: writeString,
  array: writeJSON,
  object: writeJSON,
};

function writeJSON(value: any) {
  return JSON.stringify(value);
}

function writeString(value: any) {
  return `${value}`;
}

export function readAttributeValue(value: string, type: AttributeTypeConstant) {
  const readerType = parseAttributeTypeConstant(type);
  if (!readerType) throw new TypeError(`[light-element] Unknown type "${type}"`);
  return readers[readerType](value);
}

export function writeAttributeValue(value: any, type: AttributeTypeConstant) {
  const writerType = parseAttributeTypeConstant(type);
  if (!writerType) throw new TypeError(`[light-element] Unknown type "${type}"`);
  return (writers[writerType] || writers.default)(value);
}
