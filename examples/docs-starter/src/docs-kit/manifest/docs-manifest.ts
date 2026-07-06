export type DocsManifestPage = {
	section: string;
	slug: string;
	title: string;
	description?: string;
	llms?: boolean;
};

export type DocsManifestSection = {
	id: string;
	title: string;
	pages: DocsManifestPage[];
};

export type DocsManifest = {
	rootDir: string;
	sections: DocsManifestSection[];
};
