import postcss from "postcss";
import postCssImport from "postcss-import";
import autoprefixer from "autoprefixer";
import cssnano from "cssnano";
import tailwindcss from "tailwindcss";
import tailwindcssNesting from "tailwindcss/nesting/index.js";

/**
 * A macro that allows you to import a postcss file and have it processed by postcss.
 * Unfortunately, this macro is not able to receive not serializable values
 * and it cannot receive the `srcLocation` as a variable (i.e. `import.meta.url`).
 * Instead, it must be a string literal.
 * As a convention we use the `@` symbol to denote the project `root` directory.
 * i.e. `postcssMacro("@/src/components/wce-counter/wce-counter.styles.css")`
 * @param srcLocation - The location of the file relative to the src directory.
 * @param path - The path to the file relative to the src directory.
 */
export const postcssMacro = async (path: string) => {
  const rootUrl = import.meta.dir.split("/").slice(0, -1).join("/");
  const fileUrl = `${rootUrl}${path.substring(1)}`;
  const contents = await Bun.file(fileUrl).text();

  const processor = postcss([
    postCssImport(),
    tailwindcssNesting,
    tailwindcss,
    autoprefixer,
    cssnano,
  ]);

  return await processor
    .process(contents, { from: path })
    .then((result) => result.css);
};
