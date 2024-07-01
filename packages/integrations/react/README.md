# Ecopages React Integration Plugin

The `@ecopages/react` package introduces an experimental integration with [React](https://reactjs.org/) version 19, enabling developers to leverage React's robust ecosystem and component model within the Ecopages platform. This integration aims to provide a seamless experience for using React components in your Ecopages projects, combining React's declarative UI library with the flexibility and simplicity of Ecopages.

This experimental integration is designed for those looking to experiment with React's latest features within the context of Ecopages, offering a new avenue for building dynamic and interactive web pages.

## Install

```bash
bunx jsr add @ecopages/react
```

## Usage

To incorporate the React integration into your Ecopages project, you can configure your project as follows:

```ts
import { reactPlugin } from "@ecopages/react";

const config: EcoPagesConfigInput = {
  rootDir: import.meta.dir,
  baseUrl: import.meta.env.ECOPAGES_BASE_URL,
  integrations: [reactPlugin()],
};

export default config;
```

By adopting this setup, developers can start exploring the potential of combining React's powerful features with the streamlined workflow of Ecopages, even as we continue to refine and enhance this integration.
