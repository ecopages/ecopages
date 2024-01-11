import { TemplateResult } from "lit";
import { RenderResultReadable } from "@lit-labs/ssr/lib/render-result-readable";
import { RenderResult, render } from "@lit-labs/ssr";
import { BaseHeadProps, BaseHead } from "../includes/head/base-head";

export type LazyElementDisabled = {
  enabled: false;
};

export type LazyElementEnabled = {
  enabled: true;
  script: string;
  /**
   * @default "visible"
   */
  on?: "interaction" | "visible" | "idle" | "media" | "save-data";
  onValue?: string;
};

export type LazyElement = LazyElementDisabled | LazyElementEnabled;

export type BodyElementLit = {
  element: TemplateResult<1>;
  kind: "lit";
  options?: {
    lazy: LazyElement;
  };
};

export type BodyElementJsx = {
  element(): JSX.Element;
  kind: "jsx";
};

export type RenderPageStream = {
  metadata: BaseHeadProps["metadata"];
  headContent: BaseHeadProps["headContent"];
  bodyElements: (BodyElementLit | BodyElementJsx)[];
  language?: string;
};

export function enhanceHeadContent(
  headContent: BaseHeadProps["headContent"],
  bodyElements: RenderPageStream["bodyElements"]
): BaseHeadProps["headContent"] {
  const enhancedHeadContent = [];

  const elementsHeadContent = bodyElements
    .filter((element) => element.kind === "lit")
    .map((element) => {
      const litElement = element as BodyElementLit;
      if (litElement.options?.lazy?.enabled) {
        return litElement.options?.lazy?.script;
      }
    })
    .filter((script) => script !== undefined);

  enhancedHeadContent.push(...elementsHeadContent);

  if (headContent instanceof Array) {
    enhancedHeadContent.push(...headContent);
  } else {
    enhancedHeadContent.push(headContent);
  }

  return headContent;
}

class IsLandWrapper {
  static start({
    on = "visible",
    onValue,
    script,
  }: Omit<LazyElementEnabled, "enabled">) {
    const interaction = onValue ? `on:${on}:${onValue}` : `on:${on}`;
    return `<is-land ${interaction}><template data-island><script type="module" src="${script}"></script></template>`;
  }
  static end() {
    return "</is-land>";
  }
}

class HtmlWrapper {
  static start({ language = "en" }: { language?: string }) {
    return `<html lang='${language}'>`;
  }
  static end() {
    return "</html>";
  }
}

class BodyWrapper {
  static start({ dsdPending = false }: { dsdPending: boolean }) {
    return `<body ${dsdPending ? "dsd-pending" : ""}>`;
  }
  static end() {
    return "</body>";
  }
}

function* renderJsxElement(bodyElement: BodyElementJsx) {
  yield bodyElement.element();
}

function* renderLitElement(bodyElement: BodyElementLit) {
  const isLazyEnabled = bodyElement.options?.lazy?.enabled;

  if (isLazyEnabled) {
    yield IsLandWrapper.start({
      on: bodyElement.options!.lazy.on,
      onValue: bodyElement.options!.lazy.onValue,
      script: bodyElement.options!.lazy.script,
    });
  }

  yield* render(bodyElement.element);

  if (isLazyEnabled) {
    yield IsLandWrapper.end();
  }
}

function* renderBodyElements(
  bodyElements: RenderPageStream["bodyElements"]
): RenderResult {
  for (const bodyElement of bodyElements) {
    switch (bodyElement.kind) {
      case "jsx":
        yield* renderJsxElement(bodyElement);
        break;
      case "lit":
        yield* renderLitElement(bodyElement);
        break;
      default:
        throw new Error("Unknown body element kind");
    }
  }
}

function* pageGenerator({
  metadata,
  headContent,
  bodyElements,
  language,
}: RenderPageStream): RenderResult {
  const enhancedHeadContent = enhanceHeadContent(headContent, bodyElements);
  const dsdPending = bodyElements.some((element) => element.kind === "lit");

  yield HtmlWrapper.start({ language });

  yield BaseHead({
    metadata: metadata,
    headContent: enhancedHeadContent,
  });

  yield BodyWrapper.start({ dsdPending });

  yield* renderBodyElements(bodyElements);

  yield BodyWrapper.end();

  yield HtmlWrapper.end();
}

export function renderPageStream({
  metadata,
  headContent,
  bodyElements,
}: RenderPageStream) {
  const renderResultReadable = new RenderResultReadable(
    pageGenerator({
      metadata,
      headContent,
      bodyElements,
    })
  );

  const readableStream = new ReadableStream<RenderResultReadable>({
    start(controller) {
      renderResultReadable.on("data", (chunk) => controller.enqueue(chunk));
      renderResultReadable.on("end", () => controller.close());
    },
  });

  return readableStream;
}
