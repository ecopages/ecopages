import "@11ty/is-land";

export interface IsLandObserverProps {
  "on:visible"?: boolean;
  "on:idle"?: boolean;
  "on:interaction"?: string;
  "on:media"?: string;
  "on:save-data"?: true | "false";
  children?: Html.Children;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "is-land": HtmlTag & {
        children: Html.Children;
        import?: string;
      } & IsLandObserverProps;
    }
  }
}
