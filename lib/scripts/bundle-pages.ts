import fs from "node:fs";
import { PUBLIC_FOLDER, DIST_DIR_PUBLIC, DIST_DIR } from "root/lib/global/constants";
import { collectHtmlPages } from "root/lib/scripts/collect-html-pages";

export async function buildPages({ baseUrl }: { baseUrl: string }) {
  fs.cpSync(PUBLIC_FOLDER, DIST_DIR_PUBLIC, { recursive: true });

  const routesToRender = await collectHtmlPages();

  for (const route of routesToRender) {
    const path = route.path === "/" ? "index.html" : `${route.path}/index.html`;
    const docType = "<!DOCTYPE html>";
    await Bun.write(`${DIST_DIR}/${path}`, docType + route.html.toString());
  }
}
