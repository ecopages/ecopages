import { describe, expect, test } from "bun:test";
import { pathAnalyser } from "./path-analyser";

describe("pathAnalyser", () => {
  test.each([
    [
      "packages/core/src/utils/file-name-analyzer.ts",
      {
        root: "",
        dir: "packages/core/src/utils",
        base: "file-name-analyzer.ts",
        ext: ".ts",
        name: "file-name-analyzer",
        descriptor: undefined,
      },
    ],
    [
      "packages/playground/src/pages/blog/author/%5Bid%5D.kita.tsx",
      {
        root: "",
        dir: "packages/playground/src/pages/blog/author",
        base: "%5Bid%5D.kita.tsx",
        ext: ".tsx",
        name: "%5Bid%5D.kita",
        descriptor: "kita",
      },
    ],
    [
      "packages/core/src/component-utils/deps-manager.ts",
      {
        root: "",
        dir: "packages/core/src/component-utils",
        base: "deps-manager.ts",
        ext: ".ts",
        name: "deps-manager",
        descriptor: undefined,
      },
    ],
    [
      "/packages/core/src/plugins/build-html-pages/build-html-pages.plugin.ts",
      {
        root: "/",
        dir: "/packages/core/src/plugins/build-html-pages",
        base: "build-html-pages.plugin.ts",
        ext: ".ts",
        name: "build-html-pages.plugin",
        descriptor: "plugin",
      },
    ],
    [
      "packages/core/src/eco-pages.fake.descriptor.ts",
      {
        root: "",
        dir: "packages/core/src",
        base: "eco-pages.fake.descriptor.ts",
        ext: ".ts",
        name: "eco-pages.fake.descriptor",
        descriptor: "descriptor",
      },
    ],
  ])("%p should return the correct values", (filePath, expected) => {
    expect(pathAnalyser(filePath)).toEqual(expected);
  });
});
