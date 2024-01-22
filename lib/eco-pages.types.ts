export type EcoComponentDependencies = {
  stylesheets?: string[];
  scripts?: string[];
};

export interface EcoComponent<T = {}> {
  (props: T): JSX.Element;
  dependencies?: EcoComponentDependencies;
}

export const defaultTemplateFormats = {
  kita: "kita",
} as const;

export type DefaultTemplateFormats = keyof typeof defaultTemplateFormats;

export type RenderRouteOptions = {
  file: string;
  pagesDir: string;
};

export type RenderRouteConfig = {
  path: string;
  html: JSX.Element;
};
