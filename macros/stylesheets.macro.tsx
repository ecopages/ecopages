import { postcssMacro } from "macros/postcss.macro"

async function collectStylesheets(stylesheetPaths: string[]) {
  const styleSheets = [];
  for (const path of stylesheetPaths) {
    const postcss = await postcssMacro(path)
    styleSheets.push(postcss);
  }
  return styleSheets;
}

export async function createStylesheets({ paths }: { paths?: string[] }) {
  if (!paths?.length) return [];
  const safeStylesheets = await collectStylesheets(paths);
  return safeStylesheets
}