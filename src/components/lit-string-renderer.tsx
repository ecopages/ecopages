import { TemplateResult, html } from "lit"
import { render } from '@lit-labs/ssr';
import { collectResultSync } from "@lit-labs/ssr/lib/render-result";
import { IsLandObserverProps } from "../scripts/is-land";

interface ILitRenderer extends IsLandObserverProps {
  element: TemplateResult<1>,
  import?: string
}

export function LitRenderer({ element, ...props }: ILitRenderer) {
  const rendered = render(element);
  const safeContent = collectResultSync(rendered);

  const options = props || {}

  if (Object.keys(options).length === 0) return safeContent

  const { import: src, ...observerProps } = options

  return <is-land {...observerProps} import={src}>
    {safeContent}
  </is-land>
}
