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
 * Builds the inline module script that boots the global lazy injector on the client.
 * Emitted once per page alongside the `ecopages/global-injector-map` script block.
 */
export function buildGlobalInjectorBootstrapContent(globalInjectorModuleUrl: string): string {
	return `import { initGlobalInjector } from ${JSON.stringify(globalInjectorModuleUrl)};

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

const globalScope = window;
if (typeof globalScope.__ecoGlobalInjectorCleanup === 'function') {
	globalScope.__ecoGlobalInjectorCleanup();
}

const injector = initGlobalInjector();

const handleBeforeSwap = () => {
	injector.cleanup();
};

const handleAfterSwap = () => {
	pruneStaleTriggerMaps();
	injector.refresh();
};

document.addEventListener('eco:before-swap', handleBeforeSwap);
document.addEventListener('eco:after-swap', handleAfterSwap);
pruneStaleTriggerMaps();

globalScope.__ecoGlobalInjectorCleanup = () => {
	document.removeEventListener('eco:before-swap', handleBeforeSwap);
	document.removeEventListener('eco:after-swap', handleAfterSwap);
	injector.cleanup();
};`;
}
