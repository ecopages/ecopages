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
      pages: [{ title: 'RadiantElement', slug: 'lite-element' }],
    },
    {
      name: 'Decorators',
      subdirectory: 'decorators',
      pages: [
        { title: '@customElement', slug: 'custom-element' },
        { title: '@event', slug: 'event' },
        { title: '@onEvent', slug: 'on-event' },
        { title: '@onUpdated', slug: 'on-updated' },
        { title: '@query', slug: 'query' },
        { title: '@reactiveProp', slug: 'reactive-prop' },
        { title: '@reactiveField', slug: 'reactive-field' },
      ],
    },
    {
      name: 'Context',
      subdirectory: 'context',
      pages: [
        { title: 'Lite Context', slug: 'lite-context' },
        { title: '@provideContext', slug: 'context-provider' },
        { title: '@consumeContext', slug: 'context-consumer' },
        { title: '@contextSelector', slug: 'context-selector' },
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
      pages: [
        { title: 'Lite Counter', slug: 'lite-counter' },
        { title: 'Lite Todo App', slug: 'lite-todo-app' },
      ],
    },
  ],
};
