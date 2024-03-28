import { describe, expect, test } from "bun:test";
import { ServerUtils } from "./server-utils";

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
});
