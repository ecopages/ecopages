import path from "node:path";
import { describe, expect, test } from "bun:test";
import { FSRouterScanner } from "./fs-router-scanner";
import { createGlobalConfig } from "@/build/create-global-config";
import { FIXTURE_PROJECT_DIR } from "fixtures/constants";

await createGlobalConfig({
  projectDir: path.resolve(FIXTURE_PROJECT_DIR),
  watchMode: false,
});

const {
  templatesExt,
  absolutePaths: { pagesDir },
} = globalThis.ecoConfig;

describe("FSRouterScanner", () => {
  test("when scan is called, it should return an object with routes", async () => {
    const scanner = new FSRouterScanner({
      dir: pagesDir,
      origin: "http://localhost:3000",
      templatesExt,
    });

    const routes = await scanner.scan();

    expect(routes).toEqual({
      "http://localhost:3000/": {
        filePath: `${pagesDir}/index.kita.tsx`,
        kind: "exact",
        pathname: "/",
        src: "http://localhost:3000/",
        strategy: "static",
      },
      "http://localhost:3000/catch-all/[...path]": {
        filePath: `${pagesDir}/catch-all/[...path].kita.tsx`,
        kind: "catch-all",
        pathname: "/catch-all/[...path]",
        src: "http://localhost:3000/catch-all/[...path]",
        strategy: "ssr",
      },
      "http://localhost:3000/dynamic/[slug]": {
        filePath: `${pagesDir}/dynamic/[slug].kita.tsx`,
        kind: "dynamic",
        pathname: "/dynamic/[slug]",
        src: "http://localhost:3000/dynamic/[slug]",
        strategy: "ssr",
      },
    });
  });
});
