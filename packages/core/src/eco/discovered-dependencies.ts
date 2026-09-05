import type { EcoComponentDependencies, EcoComponentConfig, EcoDeclaredComponent } from '../types/public-types.ts';
import type { ComponentIdentity } from './component-identity.ts';

export type DiscoveredDependencies = {
	components: () => unknown[];
	stylesheets: string[];
};

const discoveries = new WeakMap<ComponentIdentity, DiscoveredDependencies>();
const inferredStyles = new WeakMap<EcoComponentDependencies, string[]>();

export function registerDiscoveredDependencies(identity: ComponentIdentity, discovered: DiscoveredDependencies): void {
	discoveries.set(identity, discovered);
}

/** Identifies inferred entries so the asset collector can prefer explicit entries across the entire graph. */
export function getInferredStylesheets(dependencies: EcoComponentDependencies | undefined): readonly string[] {
	return dependencies ? (inferredStyles.get(dependencies) ?? []) : [];
}

function isDeclared(value: unknown): value is EcoDeclaredComponent {
	return typeof value === 'function' && Boolean((value as EcoDeclaredComponent).config?.identity);
}

/**
 * @remarks
 * The component getter reads live import bindings only during graph traversal,
 * after module initialization. Keeping this on the existing dependency bag lets
 * rendering, SSR preload, ownership and watch collectors share the same graph.
 */
export function attachDiscoveredDependencies(config: EcoComponentConfig): void {
	const discovery = config.identity && discoveries.get(config.identity);
	if (!discovery) return;
	let explicit = config.dependencies;
	let merged: EcoComponentDependencies;
	const merge = () => {
		const current = explicit;
		const normalize = (src: string) =>
			src.startsWith('/') ? `file://${src}` : new URL(src, `file://${config.identity!.file}`).href;
		const stylesheetPaths = new Set(
			(current?.stylesheets ?? []).flatMap((entry) => {
				const src = typeof entry === 'string' ? entry : entry.src;
				return src ? [normalize(src)] : [];
			}),
		);
		const stylesheets = discovery.stylesheets.filter((src) => {
			const resolved = normalize(src);
			if (stylesheetPaths.has(resolved)) return false;
			stylesheetPaths.add(resolved);
			return true;
		});
		merged = {
			...current,
			stylesheets: [...(current?.stylesheets ?? []), ...stylesheets],
			get components() {
				return [...new Set([...(current?.components ?? []), ...discovery.components().filter(isDeclared)])];
			},
		};
		inferredStyles.set(merged, stylesheets);
	};
	merge();
	Object.defineProperty(config, 'dependencies', {
		enumerable: true,
		configurable: true,
		get: () => merged,
		set: (value: EcoComponentDependencies | undefined) => {
			explicit = value;
			merge();
		},
	});
}
