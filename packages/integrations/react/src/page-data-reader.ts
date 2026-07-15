import {
	ECO_PAGE_DATA_SCHEMA_VERSION,
	resolveEcoPageDataModuleUrl,
	resolveEcoPageDataProps,
	type EcoPageDataProps,
} from './page-data-manifest.ts';

export type ReadPageDataDocumentResult = {
	moduleUrl?: string;
	props: EcoPageDataProps;
};

/**
 * Reads `__ECO_PAGE_DATA__`, supporting both v1 envelopes and legacy flat props.
 *
 * @remarks
 * Always returns unwrapped `props`. `moduleUrl` is set only when the document
 * carries a valid v1 envelope.
 */
export function readPageDataDocument(): ReadPageDataDocumentResult {
	const element = document.getElementById('__ECO_PAGE_DATA__');
	if (!element?.textContent) {
		return { props: {} };
	}

	try {
		const parsed: unknown = JSON.parse(element.textContent);
		const moduleUrl = resolveEcoPageDataModuleUrl(parsed) ?? undefined;
		return {
			...(moduleUrl && { moduleUrl }),
			props: resolveEcoPageDataProps(parsed),
		};
	} catch {
		return { props: {} };
	}
}

/**
 * Returns page props from `__ECO_PAGE_DATA__` for hydration and HMR handlers.
 */
export function getPageDataFromDocument(): EcoPageDataProps {
	return readPageDataDocument().props;
}

/**
 * Inlined browser bootstrap for generated hydration scripts.
 *
 * @remarks
 * Hydration and HMR entry modules are evaluated as native browser ESM. Bare
 * package imports such as `@ecopages/react/page-data-reader` are not resolvable
 * there, so the reader algorithm is embedded. Keep this string aligned with
 * {@link readPageDataDocument} / {@link getPageDataFromDocument}.
 */
export function getDevPageDataReaderBootstrapSource(): string {
	return `const readPageDataDocument = () => {
  const el = document.getElementById("__ECO_PAGE_DATA__");
  if (!el?.textContent) {
    return { props: {} };
  }
  try {
    const parsed = JSON.parse(el.textContent);
    if (
      parsed &&
      parsed.schemaVersion === ${ECO_PAGE_DATA_SCHEMA_VERSION} &&
      parsed.navigationOwner === "react-router" &&
      typeof parsed.moduleUrl === "string" &&
      parsed.props &&
      typeof parsed.props === "object" &&
      !Array.isArray(parsed.props)
    ) {
      return { moduleUrl: parsed.moduleUrl, props: parsed.props };
    }
    if (parsed && typeof parsed === "object" && typeof parsed.schemaVersion === "number") {
      return { props: {} };
    }
    return {
      props: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {},
    };
  } catch {
    return { props: {} };
  }
};
const getPageData = () => readPageDataDocument().props;`;
}

/**
 * Minified equivalent of {@link getDevPageDataReaderBootstrapSource}.
 */
export function getProdPageDataReaderBootstrapSource(): string {
	return `const rd=()=>{const e=document.getElementById("__ECO_PAGE_DATA__");if(!e?.textContent)return{props:{}};try{const p=JSON.parse(e.textContent);if(p&&p.schemaVersion===${ECO_PAGE_DATA_SCHEMA_VERSION}&&p.navigationOwner==="react-router"&&typeof p.moduleUrl==="string"&&p.props&&typeof p.props==="object"&&!Array.isArray(p.props))return{moduleUrl:p.moduleUrl,props:p.props};if(p&&typeof p==="object"&&typeof p.schemaVersion==="number")return{props:{}};return{props:p&&typeof p==="object"&&!Array.isArray(p)?p:{}}}catch{return{props:{}}}};const gd=()=>rd().props;`;
}
