import { defineConfig } from '@ecopages/core/config';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { kitajsPlugin } from '@ecopages/kitajs';
import { litPlugin } from '@ecopages/lit';
import { reactPlugin } from '@ecopages/react';

export default defineConfig({
	rootDir: import.meta.dirname,
	baseUrl: 'http://localhost:3000',
	defaultMetadata: { title: 'Ecopages', description: 'Ecopages' },
	robotsTxt: { preferences: { '*': [] } },
	integrations: [kitajsPlugin(), litPlugin(), ecopagesJsxPlugin(), reactPlugin({ extensions: ['.react.tsx'] })],
});
