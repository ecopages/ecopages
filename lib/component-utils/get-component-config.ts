export const acceptedDependencies = {
  stylesheet: "stylesheet",
  script: "script",
} as const;

export type AcceptedDependencies = (typeof acceptedDependencies)[keyof typeof acceptedDependencies];

function getExtension(format: AcceptedDependencies) {
  return format === "stylesheet" ? "styles.css" : "script.js";
}

const getIndexPath = (url: string) => {
  const [, indexPath] = url.split("src/");
  return indexPath.split("/").slice(0, -1).join("/");
};

const getNameFromPath = (path: string) => {
  return path.split("/")[1];
};

const getDepPath = ({
  importMeta,
  format,
}: {
  importMeta: ImportMeta;
  format: AcceptedDependencies;
}) => {
  const { url } = importMeta;
  const path = getIndexPath(url);
  const name = getNameFromPath(path);
  return `${path}/${name}.${getExtension(format)}`;
};

export type ComponentConfigOptions = {
  template: (args: any) => JSX.Element;
  importMeta: ImportMeta;
  deps?: AcceptedDependencies[];
};

export type ComponentConfig = {
  template: (args: any) => JSX.Element;
  stylesheet?: string;
  script?: string;
};

export function getComponentConfig({
  template,
  importMeta,
  deps = [],
}: ComponentConfigOptions): ComponentConfig {
  const stylesheet = deps.includes("stylesheet")
    ? getDepPath({
        importMeta,
        format: "stylesheet",
      })
    : undefined;

  const script = deps.includes("script")
    ? getDepPath({
        importMeta,
        format: "script",
      })
    : undefined;

  return {
    template,
    stylesheet,
    script,
  };
}
