import type { DefaultTemplateFormats } from "root/lib/eco-pages.types";
import fs from "fs";
import path from "path";
import { PAGES_DIR } from "root/lib/global/constants";
import { createKitaRoute } from "./templates/create-kita-route";

function getFiles(dir: string) {
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  const files: any[] = dirents.map((dirent) => {
    const res = path.resolve(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(res) : res;
  });
  return Array.prototype.concat(...files);
}

async function createRouteConfig({ file, pagesDir }: { file: string; pagesDir: string }) {
  const renderType = file.split(".").at(-2) as DefaultTemplateFormats;

  switch (renderType) {
    case "kita":
      return await createKitaRoute({ file, pagesDir });
    default:
      throw new Error(`Unknown render type: ${renderType}`);
  }
}

export async function collectHtmlPages() {
  const pagesDir = path.join(process.cwd(), PAGES_DIR);
  const files = getFiles(pagesDir);
  const routes = await Promise.all(
    files.map((file) => {
      return createRouteConfig({ file, pagesDir });
    })
  );

  return routes;
}
