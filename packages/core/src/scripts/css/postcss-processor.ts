import postcss from "postcss";
import postCssImport from "postcss-import";
import autoprefixer from "autoprefixer";
import cssnano from "cssnano";
import tailwindcss from "tailwindcss";
import tailwindcssNesting from "tailwindcss/nesting/index.js";
import { FileUtils } from "@/utils/file-utils";

/**
 * @function postcssProcessor
 * @description
 * This function processes the postcss file.
 * It uses postcss, postcss-import, tailwindcss, autoprefixer, and cssnano.
 * It is mainly used in the build process.
 */
export const postcssProcessor = async (path: string) => {
  const contents = await FileUtils.getPathAsString(path);

  const processor = postcss([
    postCssImport(),
    tailwindcssNesting,
    tailwindcss,
    autoprefixer,
    cssnano,
  ]);

  return await processor.process(contents, { from: path }).then((result) => result.css);
};
