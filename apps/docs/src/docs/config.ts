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
      { title: 'Configuration', path: '/docs/configuration' },
    ],
  },
  {
    name: 'Guides',
    pages: [
      { title: 'Creating Pages', path: '/docs/creating-pages' },
      { title: 'Creating Layouts', path: '/docs/creating-layouts' },
      { title: 'Creating Components', path: '/docs/creating-components' },
    ],
  },
];
