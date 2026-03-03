import type { ResolvedLazyTrigger } from '../public-types.ts';

type GlobalInjectorEntry = {
	'on:idle'?: { scripts: string[] };
	'on:interaction'?: { value: string; scripts: string[] };
	'on:visible'?: { value?: string; scripts: string[] };
};

type GlobalInjectorMap = Record<string, GlobalInjectorEntry>;

/**
 * Converts a flat list of resolved triggers into the map structure consumed
 * by the `initGlobalInjector` bootstrap. Multiple triggers sharing the same
 * `triggerId` are merged so their script lists are deduplicated.
 */
function buildGlobalInjectorMap(triggers: ResolvedLazyTrigger[]): GlobalInjectorMap {
	const map: GlobalInjectorMap = {};

	for (const { triggerId, rules } of triggers) {
		const entry: GlobalInjectorEntry = map[triggerId] ?? {};

		for (const rule of rules) {
			if ('on:idle' in rule) {
				const { scripts } = rule['on:idle'];
				entry['on:idle'] = {
					scripts: Array.from(new Set([...(entry['on:idle']?.scripts ?? []), ...scripts])),
				};
				continue;
			}

			if ('on:interaction' in rule) {
				const { value, scripts } = rule['on:interaction'];
				entry['on:interaction'] = {
					value,
					scripts: Array.from(new Set([...(entry['on:interaction']?.scripts ?? []), ...scripts])),
				};
				continue;
			}

			if ('on:visible' in rule) {
				const { value, scripts } = rule['on:visible'];
				entry['on:visible'] = {
					...(value ? { value } : {}),
					scripts: Array.from(new Set([...(entry['on:visible']?.scripts ?? []), ...scripts])),
				};
				continue;
			}
		}

		if (Object.keys(entry).length > 0) {
			map[triggerId] = entry;
		}
	}

	return map;
}

/**
 * Serializes resolved lazy triggers into a JSON string safe for embedding
 * inside an inline `<script type="ecopages/global-injector-map">` tag.
 *
 * The `</script` sequence is escaped because an unescaped occurrence in inline
 * script content causes the HTML parser to close the script tag prematurely,
 * breaking page rendering. `JSON.stringify` does not perform this escape by
 * default, so a targeted replacement is applied after serialization.
 */
export function buildGlobalInjectorMapScript(triggers: ResolvedLazyTrigger[]): string {
	const map = buildGlobalInjectorMap(triggers);
	return JSON.stringify(map).replace(/<\/script/gi, '<\\/script');
}

/**
 * Inline module script that boots the global lazy injector on the client.
 * Emitted once per page alongside the `ecopages/global-injector-map` script block.
 *
 * @remarks
 * This runtime intentionally duplicates `@ecopages/scripts-injector/global` behavior
 * for the current migration phase because this repo requires fixes that are not yet
 * upstream in that package.
 *
 * Implemented compatibility fixes:
 * - Prevents interaction replay loops that could make the page unresponsive by
 *   removing capture listeners after first successful interaction-driven load.
 * - Replays click interactions using `event.composedPath()[0]` first, which is
 *   required for shadow-DOM components (for example Lit custom elements).
 * - Tracks loaded scripts per element (`data-loaded-scripts`) so mixed rules such
 *   as `on:idle` + `on:interaction` do not short-circuit each other.
 * - Keeps dynamic trigger discovery via `MutationObserver` for nodes added after
 *   initial render.
 *
 * @todo Upstream these runtime fixes to `@ecopages/scripts-injector/global`, then
 * replace this inline implementation with:
 * `import { initGlobalInjector } from '@ecopages/scripts-injector/global';`
 */
export const GLOBAL_INJECTOR_BOOTSTRAP_CONTENT =
	`const loadingScripts = new Map();

function scriptExists(url) {
	return document.querySelector(\`script[src="\${url}"]\`) !== null;
}

function loadScript(url) {
	if (scriptExists(url)) {
		return Promise.resolve();
	}

	const existingPromise = loadingScripts.get(url);
	if (existingPromise) {
		return existingPromise;
	}

	const promise = new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = url;
		script.type = 'module';
		script.async = true;
		script.onload = () => {
			loadingScripts.delete(url);
			resolve();
		};
		script.onerror = (event) => {
			loadingScripts.delete(url);
			reject(event);
		};
		document.head.appendChild(script);
	});

	loadingScripts.set(url, promise);
	return promise;
}

function parseTriggerMap() {
	const mapScripts = document.querySelectorAll('script[type="ecopages/global-injector-map"]');
	const latestMapScript = mapScripts[mapScripts.length - 1];
	if (!latestMapScript?.textContent) {
		return {};
	}

	try {
		return JSON.parse(latestMapScript.textContent);
	} catch (error) {
		console.error('[global-injector] Failed to parse global-injector-map JSON', error);
		return {};
	}
}

function pruneStaleTriggerMaps() {
	const mapScripts = Array.from(document.querySelectorAll('script[type="ecopages/global-injector-map"]'));
	if (mapScripts.length <= 1) {
		return;
	}

	const latestMapScript = mapScripts[mapScripts.length - 1];
	for (const mapScript of mapScripts) {
		if (mapScript !== latestMapScript) {
			mapScript.remove();
		}
	}
}

async function loadRuleScripts(element, rule, reason) {
	const loadedScriptsAttr = element.getAttribute('data-loaded-scripts') ?? '';
	const loadedScripts = new Set(loadedScriptsAttr.split(',').filter(Boolean));
	const scriptsToLoad = rule.scripts.filter((scriptUrl) => !loadedScripts.has(scriptUrl));

	if (scriptsToLoad.length === 0) {
		return;
	}

	const pendingLoads = scriptsToLoad.map((scriptUrl) => loadScript(scriptUrl));
	await Promise.allSettled(pendingLoads);
	element.setAttribute('data-load-reason', reason);

	for (const scriptUrl of scriptsToLoad) {
		if (scriptExists(scriptUrl)) {
			loadedScripts.add(scriptUrl);
		}
	}

	element.setAttribute('data-loaded-scripts', Array.from(loadedScripts).join(','));
}

function initGlobalInjectorRuntime() {
	let triggerMap = parseTriggerMap();
	const interactionListeners = new WeakMap();

	const unbindTrigger = (element) => {
		const boundListeners = interactionListeners.get(element) ?? [];
		for (const boundListener of boundListeners) {
			element.removeEventListener(boundListener.eventType, boundListener.listener, true);
		}
		interactionListeners.delete(element);
		element.removeAttribute('data-eco-bound');
		element.removeAttribute('data-eco-bound-trigger');
		element.removeAttribute('data-loaded-scripts');
		element.removeAttribute('data-loaded');
		element.removeAttribute('data-load-reason');
	};

	const bindTrigger = (element) => {
		if (!(element instanceof HTMLElement)) return;

		const triggerId = element.getAttribute('data-eco-trigger');
		if (!triggerId) return;

		const alreadyBound = element.hasAttribute('data-eco-bound');
		const boundTriggerId = element.getAttribute('data-eco-bound-trigger');
		if (alreadyBound && boundTriggerId === triggerId) return;
		if (alreadyBound && boundTriggerId !== triggerId) {
			unbindTrigger(element);
		}

		const entry = triggerMap[triggerId];
		if (!entry) return;

		const allEntryScripts = Array.from(
			new Set(
				Object.values(entry)
					.flatMap((entryRule) => (Array.isArray(entryRule?.scripts) ? entryRule.scripts : []))
					.filter(Boolean),
			),
		);

		element.setAttribute('data-eco-bound', 'true');
		element.setAttribute('data-eco-bound-trigger', triggerId);

		for (const [ruleType, rule] of Object.entries(entry)) {
			if (!rule || !Array.isArray(rule.scripts) || rule.scripts.length === 0) continue;

			if (ruleType === 'on:idle') {
				queueMicrotask(() => {
					void loadRuleScripts(element, rule, 'idle');
				});
				continue;
			}

			if (ruleType === 'on:visible') {
				const observer = new IntersectionObserver(
					(entries) => {
						for (const visibilityEntry of entries) {
							if (visibilityEntry.isIntersecting) {
								void loadRuleScripts(element, rule, 'visible');
								observer.disconnect();
							}
						}
					},
					{
						rootMargin: rule.value && rule.value !== 'true' ? rule.value : '50px 0px',
						threshold: 0.1,
					},
				);
				observer.observe(element);
				continue;
			}

			if (ruleType === 'on:interaction') {
				const eventTypes = (rule.value ?? '')
					.split(',')
					.map((eventType) => eventType.trim())
					.filter(Boolean);

				if (eventTypes.length === 0) continue;

				const elementListeners = interactionListeners.get(element) ?? [];

				for (const eventType of eventTypes) {
					const listener = async (event) => {
						const loadedScriptsAttr = element.getAttribute('data-loaded-scripts') ?? '';
						const loadedScripts = new Set(loadedScriptsAttr.split(',').filter(Boolean));
						const interactionAlreadyLoaded = rule.scripts.every((scriptUrl) => loadedScripts.has(scriptUrl));

						if (interactionAlreadyLoaded) {
							return;
						}

						event.stopImmediatePropagation();
						event.preventDefault();

						await loadRuleScripts(element, rule, 'interaction:' + event.type);

						const updatedLoadedScriptsAttr = element.getAttribute('data-loaded-scripts') ?? '';
						const updatedLoadedScripts = new Set(updatedLoadedScriptsAttr.split(',').filter(Boolean));
						const allRulesLoaded = allEntryScripts.every((scriptUrl) => updatedLoadedScripts.has(scriptUrl));
						if (allRulesLoaded) {
							element.setAttribute('data-loaded', '');
						}

						const boundListeners = interactionListeners.get(element) ?? [];
						for (const boundListener of boundListeners) {
							element.removeEventListener(boundListener.eventType, boundListener.listener, true);
						}
						interactionListeners.delete(element);

						const originalTarget = typeof event.composedPath === 'function' ? event.composedPath()[0] : null;
						if (event.type === 'click' && originalTarget instanceof HTMLElement && originalTarget !== element) {
							originalTarget.click();
						} else if (event.type === 'click' && event.target instanceof HTMLElement && event.target !== element) {
							event.target.click();
						}
					};

					element.addEventListener(eventType, listener, true);
					elementListeners.push({ eventType, listener });
				}

				interactionListeners.set(element, elementListeners);
			}
		}
	};

	document.querySelectorAll('[data-eco-trigger]').forEach(bindTrigger);
	pruneStaleTriggerMaps();

	document.addEventListener('eco:after-swap', () => {
		triggerMap = parseTriggerMap();
		document.querySelectorAll('[data-eco-trigger]').forEach(bindTrigger);
		pruneStaleTriggerMaps();
	});

	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (mutation.type === 'childList') {
				for (const node of Array.from(mutation.addedNodes)) {
					if (!(node instanceof Element)) continue;
					if (node.hasAttribute('data-eco-trigger')) bindTrigger(node);
					node.querySelectorAll('[data-eco-trigger]').forEach(bindTrigger);
				}
				continue;
			}

			if (mutation.type === 'attributes' && mutation.attributeName === 'data-eco-trigger') {
				if (mutation.target instanceof Element) {
					bindTrigger(mutation.target);
				}
			}
		}
	});

	if (document.body) {
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['data-eco-trigger'],
		});
	} else {
		document.addEventListener('DOMContentLoaded', () => {
			document.querySelectorAll('[data-eco-trigger]').forEach(bindTrigger);
			observer.observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ['data-eco-trigger'],
			});
		});
	}
}

initGlobalInjectorRuntime();`;

