export type SourceModuleLoader = (id: string) => Promise<unknown>;

export type SourceModuleLoaderFactory = () => SourceModuleLoader | undefined;
