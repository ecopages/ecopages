# Ecopages React Integration Plugin

The `@ecopages/react` package introduces an experimental integration with [React](https://reactjs.org/) version 19, enabling developers to leverage React's robust ecosystem and component model within the Ecopages platform. This integration aims to provide a seamless experience for using React components in your Ecopages projects, combining React's declarative UI library with the flexibility and simplicity of Ecopages.

MDX is currently not supported using only this integration.

## Install

```bash
bunx jsr add @ecopages/react
```

## Usage

To incorporate the React integration into your Ecopages project, you can configure your project as follows:

```ts
import { ConfigBuilder } from "@ecopages/core";
import { reactPlugin } from "@ecopages/react";

const config = await new ConfigBuilder()
  .setBaseUrl(import.meta.env.ECOPAGES_BASE_URL)
  .setIntegrations([reactPlugin()])
  .build();

export default config;
```

By adopting this setup, developers can start exploring the potential of combining React's powerful features with the streamlined workflow of Ecopages, even as we continue to refine and enhance this integration.
