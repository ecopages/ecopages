/** Complete inputs that affect a Page hydration script's generated source. */
export type CompiledPageHydrationOptions = {
	importPath: string;
	pageModuleUrlExpression: string;
	scriptId: string;
	reactImportPath: string;
	reactDomClientImportPath: string;
	routerImportPath?: string;
	layoutComposeImportPath: string;
	pageLayoutNormalizationImportPath: string;
	routerComponents?: { router: string; pageContent: string };
	routerPropsExpression?: string;
	hmrEnabled: boolean;
	isMdx: boolean;
	hasPagePreload: boolean;
	minify: boolean;
};
