import { PostCssProcessor } from "@/build/postcss-processor";

export async function postcssMacroProcessor(css: string) {
  if (!globalThis.ecoConfig) return;
  const { rootDir, srcDir } = globalThis.ecoConfig;
  const cssPath = css.replace("@", `${rootDir}/${srcDir}`);
  return await new PostCssProcessor().process(cssPath);
}
