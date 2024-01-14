// export async function makeRoutes({ baseUrl }: { baseUrl: string }) {
//   const { default: HomePage, metadata: homepageMetadata } = await import("@/pages/index/index.kita")
//   const { BaseLayout } = await import("@/includes/layouts/base-layout.kita")

//   return [
//     {
//       path: "/",
//       html: <HomePage metadata={homepageMetadata} />
//     },
//     {
//       path: "/about",
//       html: <BaseLayout metadata={{
//         title: "About page",
//         description: "This is the about page of the website",
//         image: baseUrl + "public/assets/images/bun-og.png",
//         keywords: ["typescript", "framework", "static"],
//       }}
//       >
//         <div class="main-title">About page</div>
//       </BaseLayout>
//     },
//     {
//       path: "/contact",
//       html: <BaseLayout metadata={{
//         title: "Contact page",
//         description: "This is the contact page of the website",
//         image: baseUrl + "public/assets/images/bun-og.png",
//         keywords: ["typescript", "framework", "static"],
//       }}>
//         <div>Contact page</div>
//       </BaseLayout>
//     }
//   ]
// }

// Create a function to generate the routes using fs, it should generate a config file equal as the one above automatically.
// The directory to look for pages is on ../src/pages and it should be able to generate the routes based on the files inside that directory.

// Path: lib/eco.config.tsx

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

export async function generateRoutes() {
  const pagesDir = path.join(process.cwd(), "src/pages");
  const files = getFiles(pagesDir);
  const routes = await Promise.all(
    files.map((file) => {
      return createRouteConfig({ file, pagesDir });
    })
  );

  return routes;
}
