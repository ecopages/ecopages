/**
 * @remarks
 * The catalog hero dispatches this so the header search box can open. Do not
 * mount a second `<radiant-search-box>` — both would steal ⌘K.
 */
export const OPEN_WIKI_SEARCH_EVENT = 'llm-wiki:open-search';
