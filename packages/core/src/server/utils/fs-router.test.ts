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
    test("should return dynamic params", async () => {
      const route: Route = {
        src: "",
        filePath: "",
        kind: "dynamic",
        strategy: "static",
        pathname: "/products/[id]",
      };
      const pathname = "/products/123";
      const params = router.getDynamicParams(route, pathname);

      expect(params).toEqual({ id: "123" });
    });

    test("should return dynamic params for catch all routes", async () => {
      const route: Route = {
        src: "",
        filePath: "",
        kind: "dynamic",
        strategy: "static",
        pathname: "/products/[...id]",
      };
      const pathname = "/products/123/456/789";
      const params = router.getDynamicParams(route, pathname);

      expect(params).toEqual({ id: ["123", "456", "789"] });
    });
  });
});
