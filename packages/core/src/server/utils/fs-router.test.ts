import path from "path";
import { test, expect, it, describe } from "bun:test";
import { FSRouter, type Route } from "./fs-router";
import { createGlobalConfig } from "@/scripts/config/create-global-config";

const FIXTURE_PROJECT_DIR = path.resolve(import.meta.env.PWD, "packages/core/fixtures");

await createGlobalConfig({
  projectDir: path.resolve(FIXTURE_PROJECT_DIR),
  watchMode: false,
});

const {
  derivedPaths: { error404TemplatePath, pagesDir, distDir },
} = globalThis.ecoConfig;

const router = new FSRouter({
  dir: pagesDir,
  origin: "http://localhost:3000",
  assetPrefix: distDir,
  fileExtensions: [".kita.tsx"],
});

await router.init();

describe("FSRouter", async () => {
  describe("init", async () => {
    test("should scan and return routes", async () => {
      expect(Object.keys(router.routes).length).toBe(3);
    });
  });

  describe("getDynamicParams", async () => {
    test.each([
      ["/products/[id]", "/products/123", { id: "123" }],
      ["/products/[id]", "/products/123/456", { id: "123" }],
      ["/products/[id]", "/products/123/456/789", { id: "123" }],
    ])(
      "dynamic route %p with URL %p should have dynamic params %p",
      async (dynamicPathname, pathname, expected) => {
        const route: Route = {
          src: "",
          filePath: "",
          kind: "dynamic",
          strategy: "static",
          pathname: dynamicPathname,
        };
        const params = router.getDynamicParams(route, pathname);

        expect(params).toEqual(expected);
      }
    );

    test.each([
      ["/products/[...id]", "/products/123/456/789", { id: ["123", "456", "789"] }],
      ["/products/[...id]", "/products/123", { id: ["123"] }],
      ["/products/[...id]", "/products", { id: [] }],
    ])(
      "catch-all route %p with URL %p should have dynamic params %p",
      async (catchAllRoute, pathname, expected) => {
        const route: Route = {
          src: "",
          filePath: "",
          kind: "dynamic",
          strategy: "static",
          pathname: "/products/[...id]",
        };
        const params = router.getDynamicParams(route, pathname);

        expect(params).toEqual(expected);
      }
    );
  });
});
