# @ecopages/bun-css-processore-plugin

This TypeScript module provides a plugin for the Bun runtime, designed to process CSS files using PostCSS. It's tailored for projects that leverage Bun's fast JavaScript runtime and need a way to integrate CSS processing into their build or development workflow.

## Features

- **Customizable Filtering**: Apply the plugin only to files matching a specific pattern, thanks to the `filter` option.
- **Namespace Support**: Utilize the `namespace` option to avoid conflicts with other plugins.
- **Flexible Transformation**: Define a custom `transform` function to process the contents of CSS files according to your project's needs.

## Installation

Ensure you have Bun installed in your environment. If not, follow the [official Bun installation guide](https://bun.sh/).

Please refer to `@ecopages/postcss-processor` if you want to use an opinionated postcss processor transform function.

## Usage

**Import the Plugin:** First, import the bunPostCssPlugin function from the module.

```ts
import { bunPostCssPlugin } from "./path/to/bun-postcss.plugin";
```

**Configure the Plugin:** Define your plugin options. You can specify a filter regex to process only certain files, a namespace to avoid conflicts, and a transform function to customize how CSS is processed.

```ts
const postCssPluginOptions = {
  filter: /\.css$/, // Only process .css files
  namespace: "my-custom-namespace",
  transform: async (contents, { path }) => {
    // Implement your transformation logic here
    // For example, using PostCSS to process the contents
    return processedContents;
  },
};
```

**Add the Plugin to Your Bun Configuration:** Finally, integrate the plugin into your Bun.build configuration.

```ts
import Bun from "bun";

Bun.build({
  plugins: [bunPostCssPlugin(postCssPluginOptions)],
});
```

## Error Handling

The plugin includes error handling for file reading operations. If a file specified does not exist or cannot be read, an error will be thrown detailing the issue.

## Extending the Plugin

The plugin is designed to be flexible. The transform function can be tailored to meet various requirements, such as integrating different PostCSS plugins or implementing custom CSS processing logic.
