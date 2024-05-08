type DocPage = {
  title: string;
  slug: string;
};

type DocsGroup = {
  name: string;
  subdirectory?: string;
  pages: DocPage[];
};

type DocsSettings = {
  rootDir: string;
};

type DocsConfig = {
  settings: DocsSettings;
  documents: DocsGroup[];
};

export const docsConfig: DocsConfig = {
  settings: {
    rootDir: '/docs',
  },
  documents: [
    {
      name: 'Getting Started',
      subdirectory: 'getting-started',
      pages: [
        { title: 'Introduction', slug: 'introduction' },
        { title: 'Installation', slug: 'installation' },
      ],
    },
    {
      name: 'Core',
      subdirectory: 'core',
      pages: [{ title: 'LiteElement', slug: 'lite-element' }],
    },
    {
      name: 'Decorators',
      subdirectory: 'decorators',
      pages: [
        { title: '@customElement', slug: 'custom-element' },
        { title: '@onEvent', slug: 'on-event' },
        { title: '@onUpdated', slug: 'on-updated' },
        { title: '@querySelector', slug: 'query-selector' },
        { title: '@querySelectorAll', slug: 'query-selector-all' },
        { title: '@reactiveAttribute', slug: 'reactive-attribute' },
        { title: '@reactiveField', slug: 'reactive-field' },
      ],
    },
    {
      name: 'Context',
      subdirectory: 'context',
      pages: [
        { title: 'Lite Context', slug: 'lite-context' },
        { title: 'Context Provider', slug: 'context-provider' },
        { title: '@subscribe', slug: 'context-subscribe' },
        { title: '@useContext', slug: 'use-context' },
      ],
    },
    {
      name: 'Mixins',
      subdirectory: 'mixins',
      pages: [{ title: 'WithKita', slug: 'with-kita' }],
    },
    {
      name: 'Examples',
      subdirectory: 'examples',
      pages: [{ title: 'Lite Counter', slug: 'lite-counter' }],
    },
  ],
};
