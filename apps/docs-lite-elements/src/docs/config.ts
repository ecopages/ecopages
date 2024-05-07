type DocPage = {
  title: string;
  path: string;
};

type DocsGroup = {
  name: string;
  pages: DocPage[];
};

type DocsConfig = DocsGroup[];

export const docsConfig: DocsConfig = [
  {
    name: 'Getting Started',
    pages: [
      { title: 'Introduction', path: '/docs/introduction' },
      { title: 'Installation', path: '/docs/installation' },
    ],
  },
  {
    name: 'Core',
    pages: [{ title: 'LiteElement', path: '/docs/lite-element' }],
  },
  {
    name: 'Decorators',
    pages: [
      { title: '@customElement', path: '/docs/custom-element' },
      { title: '@onEvent', path: '/docs/on-event' },
      { title: '@onUpdated', path: '/docs/on-updated' },
      { title: '@querySelector', path: '/docs/query-selector' },
      { title: '@querySelectorAll', path: '/docs/query-selector-all' },
      { title: '@reactiveAttribute', path: '/docs/reactive-attribute' },
      { title: '@reactiveField', path: '/docs/reactive-field' },
    ],
  },
  {
    name: 'Context',
    pages: [
      { title: 'Lite Context', path: '/docs/lite-context' },
      { title: 'Context Provider', path: '/docs/context-provider' },
      { title: '@subscribe', path: '/docs/context-subscribe' },
      { title: '@useContext', path: '/docs/use-context' },
    ],
  },
  {
    name: 'Mixins',
    pages: [{ title: 'WithKita', path: '/docs/with-kita' }],
  },
  {
    name: 'Examples',
    pages: [{ title: 'Lite Counter', path: '/docs/lite-counter' }],
  },
];
