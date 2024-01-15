import fs from "fs";
import path from "path";

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
  const { default: Page, metadata } = await import(file);

  const config = {
    path: getHtmlPath({ file, pagesDir }),
    html: Page({ metadata }),
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
