# PostCSS Processor

This modules provides a set of utility functions for processing CSS files and strings using PostCSS along with a set of plugins like Tailwind CSS, Autoprefixer, and cssnano. It's designed to be a simple interface for transforming CSS with PostCSS in a Node.js environment.

## Features

- Process CSS files by path.
- Process CSS strings or Buffers.

## Install

```bash
bunx jsr add @ecopages/postcss-processor
```

## Usage

### Processing a CSS File

To process a CSS file located at a specific path:

```ts
import { processPath } from "@ecopages/postcss-processor";

processPath("path/to/file.css").then((processedCss) => {
  console.log(processedCss);
});
```

### Processing a CSS String or Buffer

To process a CSS string or Buffer:

```ts
import { processStringOrBuffer } from "@ecopages/postcss-processor";

const css = `body { @apply bg-blue-500; }`;

processStringOrBuffer(css).then((processedCss) => {
  console.log(processedCss);
});
```

## Error Handling

Both `processPath` and `processStringOrBuffer` functions catch and log errors internally. In case of an error, an empty string is returned.

## Dependencies

This module relies on the following PostCSS plugins and are included in the bundle.

- postcss-import: To transform @import rules by inlining content.
- @tailwindcss/nesting: To use Tailwind CSS nesting.
- tailwindcss: The Tailwind CSS framework for utility-first CSS.
- autoprefixer: To parse CSS and add vendor prefixes to CSS rules.
- cssnano: For CSS optimization.

## Customisation

It is possible to eject the default plugins and compose your own chain. All the default plugins can be reused and do not need additional install.

```ts
import anotherPostCssPlugin from "another-postcss-plugin";

const result = await PostCssProcessor.processPath(filePath, {
  plugins: [
    PostCssProcessor.defaultPlugins["postcss-import"],
    PostCssProcessor.defaultPlugins.tailwindcss,
    PostCssProcessor.defaultPlugins["tailwindcss-nesting"],
    PostCssProcessor.defaultPlugins.autoprefixer,
    anotherPostCssPlugin(),
    PostCssProcessor.defaultPlugins.cssnano,
  ],
});
```
