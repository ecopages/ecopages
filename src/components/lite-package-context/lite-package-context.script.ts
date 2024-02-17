import { LiteContext } from "@/lib/lite/context";
import { createContext } from "@/lib/lite/context/proposal";
import { customElement } from "lit/decorators.js";

class Logger {
  log(message: string) {
    console.log(`%cLOGGER`, "background: #222; color: #bada55", message);
  }
}

export const litePackageContext = createContext("lite-package-context", {
  name: "eco-pages",
  version: 0.1,
  templateSupport: ["kita"],
  logger: new Logger(),
  plugins: {
    "lit-light": true,
    alpinejs: true,
    "lit-ssr": false,
  },
});

export type LitePackageContextType = typeof litePackageContext;

@customElement("lite-package-context")
export class LitePkgContext extends LiteContext<LitePackageContextType> {
  protected override name = litePackageContext.name;
  protected override state = litePackageContext.initialValue!;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "lite-package-context": HtmlTag;
    }
  }
}
