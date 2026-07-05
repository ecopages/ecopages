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

export type DocsManifestConfigEntry = {
	section: string;
	slug: string;
	title: string;
};

export type DocsManifestConfig = {
	rootDir: string;
	sections: Array<{
		id: string;
		title: string;
		pages: DocsManifestConfigEntry[];
	}>;
};
