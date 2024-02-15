import { LiteContext, type LiteContextProps } from "@/lib/lite/context";
import { customElement, state } from "lit/decorators.js";

export type LitePkgContextStateProps = {
  name: string;
  version: number;
  templateSupport: string[];
  plugins: {
    "lit-light": boolean;
    alpinejs: boolean;
    "lit-ssr": boolean;
  };
};

@customElement("lite-pkg-context")
export class LitePkgContext extends LiteContext<LitePkgContextStateProps> {
  @state() protected override state = {
    name: "eco-pages",
    version: 0.1,
    templateSupport: ["kita"],
    plugins: {
      "lit-light": true,
      alpinejs: true,
      "lit-ssr": false,
    },
  };
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "lite-pkg-context": HtmlTag & LiteContextProps;
    }
  }
}
