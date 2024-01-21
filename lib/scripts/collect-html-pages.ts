import type { MetadataProps } from "@/includes/head/seo.kita";
import { HtmlTemplate } from "@/includes/html-template";
import type { EcoComponent } from "@/types";
import fs from "fs";
import path from "path";

export const acceptedTemplateFormats = {
  kita: "kita",
} as const;

export type AcceptedTemplateFormats = keyof typeof acceptedTemplateFormats;

function getFiles(dir: string) {
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  const files: any[] = dirents.map((dirent) => {
    const res = path.resolve(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(res) : res;
  });
  return Array.prototype.concat(...files);
}

function getHtmlPath({ file, pagesDir }: { file: string; pagesDir: string }) {
  let startIndex = file.indexOf(pagesDir) + pagesDir.length;
  let endIndex = file.lastIndexOf("/");
  let path = file.substring(startIndex, endIndex);
  if (path === "/index") return "/";
  return path;
}

async function createKitaRoute({ file, pagesDir }: { file: string; pagesDir: string }) {
  const { default: Page, metadata } = (await import(file)) as {
    default: EcoComponent;
    metadata: MetadataProps;
  };

  const config = {
    path: getHtmlPath({ file, pagesDir }),
    html: HtmlTemplate({ metadata, dependencies: Page.dependencies, children: Page({}) }),
  };

  return config;
}

async function createRouteConfig({ file, pagesDir }: { file: string; pagesDir: string }) {
  const renderType = file.split(".").at(-2);

  switch (renderType) {
    case "kita":
      return createKitaRoute({ file, pagesDir });
    default:
      throw new Error(`Unknown render type: ${renderType}`);
  }
}

export async function collectHtmlPages() {
  const pagesDir = path.join(process.cwd(), "src/pages");
  const files = getFiles(pagesDir);
  const routes = await Promise.all(
    files.map((file) => {
      return createRouteConfig({ file, pagesDir });
    })
  );

  return routes;
}
