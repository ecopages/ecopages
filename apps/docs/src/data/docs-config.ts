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
        { title: 'Configuration', slug: 'configuration' },
      ],
    },
    {
      name: 'Guides',
      subdirectory: 'guides',
      pages: [
        { title: 'Creating Components', slug: 'creating-components' },
        { title: 'Creating Layouts', slug: 'creating-layouts' },
        { title: 'Creating Pages', slug: 'creating-pages' },
      ],
    },
    {
      name: 'Integrations',
      subdirectory: 'integrations',
      pages: [
        { title: 'Kitajs', slug: 'kitajs' },
        { title: 'Lit', slug: 'lit' },
        { title: 'Mdx', slug: 'mdx' },
      ],
    },
  ],
};
