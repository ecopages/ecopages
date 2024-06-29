# @ecopages/mdx

The `@ecopages/mdx` package facilitates the integration of MDX, allowing for the smooth rendering of Markdown mixed with JSX. This integration leverages the `@mdx-js/esbuild` plugin behind the scenes, providing a streamlined layer within the Ecopages integration plugin system to enhance the platform's adaptability and user-friendliness.

Integrating MDX into your Ecopages project is made simple. Import and apply the `mdxPlugin` in your Ecopages configuration as demonstrated below:

```ts
import { mdxPlugin } from "@ecopages/mdx";

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECO_PAGES_BASE_URL,
  integrations: [mdxPlugin()],
};

export default config;
```