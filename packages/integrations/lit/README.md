# Ecopages Lit Integration Plugin

The `@ecopages/lit` package enables the integration of [Lit](https://lit.dev/), a powerful library for building fast, lightweight web components. This integration is optimized for use alongside `@ecopages/kitajs`, facilitating the use of Lit within a proper HTML template engine context provided by Kita. This combination allows developers to leverage the best of both worlds: the component-based architecture of Lit and the JSX template capabilities of Kita, enhancing the development of dynamic and interactive web pages.

## Install

```bash
bunx jsr add @ecopages/lit
```

## Usage

For effective utilization of Lit in your Ecopages projects, it is recommended to use it in conjunction with Kita. This ensures a seamless development experience, allowing you to incorporate Lit components within JSX templates effortlessly. Configure your project to include both `@ecopages/lit` and `@ecopages/kitajs` as follows:

```ts
import { kitajsPlugin } from "@ecopages/kitajs";
import { litPlugin } from "@ecopages/lit";

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECOPAGES_BASE_URL,
  integrations: [kitajsPlugin(), litPlugin()],
};

export default config;
```

Adopting this setup empowers developers to fully exploit Lit's capabilities within the Ecopages framework, paving the way for the creation of rich, interactive web components.
