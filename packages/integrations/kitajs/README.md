# Ecopages KitaJs Integration Plugin

The `@ecopages/kitajs` package provides seamless integration with [Kita](https://kita.js.org/), enabling effortless rendering of JSX templates. This integration represents a minimalistic layer within the broader Ecopages integration plugin system, designed to enhance the platform's flexibility and ease of use.

## Install

```bash
bunx jsr add @ecopages/kitajs
```

## Usage

Incorporating this integration into your project is straightforward. Simply import and include the `kitajsPlugin` in your Ecopages configuration as shown below:

```ts
import { kitajsPlugin } from "@ecopages/kitajs";

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECOPAGES_BASE_URL,
  integrations: [kitajsPlugin()],
};

export default config;
```
