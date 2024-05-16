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
      name: 'Integrations',
      subdirectory: 'integrations',
      pages: [
        { title: 'Kitajs', slug: 'kita' },
        { title: 'Lit', slug: 'lit' },
        { title: 'Mdx', slug: 'mdx' },
        { title: 'React', slug: 'react' },
      ],
    },
    {
      name: 'Directories',
      subdirectory: 'directories',
      pages: [
        { title: 'Structure', slug: 'root' },
        { title: 'Components', slug: 'components' },
        { title: 'Layouts', slug: 'layouts' },
        { title: 'Includes', slug: 'includes' },
        { title: 'Pages', slug: 'pages' },
        { title: 'Public', slug: 'public' },
      ],
    },
    {
      name: 'Guides',
      subdirectory: 'guides',
      pages: [
        { title: 'Creating Pages', slug: 'creating-pages' },
        { title: 'Creating Layouts', slug: 'creating-layouts' },
        { title: 'Creating Components', slug: 'creating-components' },
      ],
    },
  ],
};
