import path from "node:path";
import { describe, expect, test } from "bun:test";
import { FSRouteScanner } from "./fs-route-scanner";
import { createGlobalConfig } from "@/scripts/config/create-global-config";
import { FIXTURE_PROJECT_DIR } from "@/constants";

await createGlobalConfig({
  projectDir: path.resolve(FIXTURE_PROJECT_DIR),
  watchMode: false,
});

const {
  derivedPaths: { pagesDir },
} = globalThis.ecoConfig;

describe("FSRouteScanner", () => {
  test("when scan is called, it should return an object with routes", async () => {
    const fsRouteScanner = new FSRouteScanner({
      dir: pagesDir,
      origin: "http://localhost:3000",
      pattern: `**/*{${[".kita.tsx"].join(",")}}`,
      fileExtensions: [".kita.tsx"],
    });
    const routes = await fsRouteScanner.scan();
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
