import path from "path";
import { describe, expect, test } from "bun:test";
import { ServerUtils } from "./server-utils";
import { FIXTURE_EXISTING_FILE_GZ_IN_DIST, FIXTURE_PROJECT_DIR } from "fixtures/constants";
import { createGlobalConfig } from "@/scripts/config/create-global-config";

await createGlobalConfig({
  projectDir: path.resolve(FIXTURE_PROJECT_DIR),
  watchMode: false,
});

describe("ServerUtils", () => {
  test.each([
    ["/my-file.controller.js", "application/javascript"],
    ["/my-file.css", "text/css"],
    ["/my-file.html", "text/html"],
    ["/my-file.json", "application/json"],
    ["/my-file.png", "image/png"],
    ["/my-file.jpg", "image/jpeg"],
    ["/my-file.jpeg", "image/jpeg"],
    ["/my-file.svg", "image/svg+xml"],
    ["/my-file.gif", "image/gif"],
    ["/my-file.ico", "image/x-icon"],
    ["/my-file", "text/plain"],
  ])("getContentType(%p) should return %p", (ext, expected) => {
    expect(ServerUtils.getContentType(`file.${ext}`)).toBe(expected);
  });

  test("serveFromDir should return a response", async () => {
    const response = await ServerUtils.serveFromDir({
      directory: globalThis.ecoConfig.distDir,
      path: FIXTURE_EXISTING_FILE_GZ_IN_DIST,
      gzip: false,
    });

    expect(response).toBeDefined();
  });
});
