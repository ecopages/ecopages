import { afterEach, describe, expect, it } from 'vitest';
import type { ReactRouterAdapter } from '../router-adapter.ts';
import { createHydrationScript } from './hydration-scripts.ts';

type TestHydrationRegistration = {
	owner: string;
	cleanupBeforeHandoff: () => Promise<void>;
};

type TestHydrationRuntime = {
	hydrateCalls: Array<{
		containerTag: string;
		hasRecoverableErrorHandler: boolean;
		tree: unknown;
	}>;
	claimedOwners: string[];
	releasedOwners: string[];
	registrations: TestHydrationRegistration[];
	unmountCount: number;
};

type TestWindowState = {
	navigation?: {
		getOwnerState?: () => {
			owner: string;
			canHandleSpaNavigation: boolean;
		};
		register?: (registration: TestHydrationRegistration) => void;
		claimOwnership?: (owner: string) => void;
		releaseOwnership?: (owner: string) => void;
	};
	react?: {
		pageRoot?: {
			render: (tree: unknown) => void;
			unmount: () => void;
		} | null;
		cleanupPageRoot?: () => void;
	};
	page?: {
		module: string;
		props: unknown;
	};
};

type TestWindow = Window &
	typeof globalThis & {
		__ECO_PAGES__?: TestWindowState;
		__ECO_REACT_HYDRATION_TEST__?: TestHydrationRuntime;
	};

const routerAdapter: ReactRouterAdapter = {
	name: 'eco-router',
	bundle: {
		importPath: '/assets/router.js',
		outputName: 'router',
		externals: [],
	},
	importMapKey: '@ecopages/react-router',
	components: {
		router: 'EcoRouter',
		pageContent: 'PageContent',
	},
	getRouterProps: (page: string, props: string) => `{ page: ${page}, pageProps: ${props} }`,
};

function createModuleUrl(source: string): string {
	return `data:text/javascript;base64,${btoa(source)}`;
}

async function importModule(moduleUrl: string): Promise<void> {
	await import(/* @vite-ignore */ moduleUrl);
}

function createRuntimeModules() {
	const reactImportPath = createModuleUrl('export const createElement = (...args) => ({ args });');
	const reactDomClientImportPath = createModuleUrl(`
export const hydrateRoot = (container, tree, options) => {
  const runtime = window.__ECO_REACT_HYDRATION_TEST__;
  runtime.hydrateCalls.push({
    containerTag: container.tagName,
    hasRecoverableErrorHandler: typeof options?.onRecoverableError === "function",
    tree,
  });

  return {
    render() {},
    unmount() {
      runtime.unmountCount += 1;
    },
  };
};
`);
	const importPath = createModuleUrl('export default function Page() { return null; }');
	const routerImportPath = createModuleUrl(`
export function EcoRouter(props) {
  return props;
}

export function PageContent() {
  return null;
}
`);

	return {
		importPath,
		reactImportPath,
		reactDomClientImportPath,
		routerImportPath,
	};
}

describe('createHydrationScript browser execution', () => {
	afterEach(() => {
		document.body.innerHTML = '';

		const testWindow = window as TestWindow;
		delete testWindow.__ECO_PAGES__;
		delete testWindow.__ECO_REACT_HYDRATION_TEST__;
	});

	it('registers router ownership and cleanup when the browser hydration bootstrap runs', async () => {
		const runtimeModules = createRuntimeModules();
		const testWindow = window as TestWindow;

		testWindow.__ECO_REACT_HYDRATION_TEST__ = {
			hydrateCalls: [],
			claimedOwners: [],
			releasedOwners: [],
			registrations: [],
			unmountCount: 0,
		};
		testWindow.__ECO_PAGES__ = {
			navigation: {
				getOwnerState: () => ({
					owner: 'html',
					canHandleSpaNavigation: false,
				}),
				register: (registration) => {
					testWindow.__ECO_REACT_HYDRATION_TEST__?.registrations.push(registration);
				},
				claimOwnership: (owner) => {
					testWindow.__ECO_REACT_HYDRATION_TEST__?.claimedOwners.push(owner);
				},
				releaseOwnership: (owner) => {
					testWindow.__ECO_REACT_HYDRATION_TEST__?.releasedOwners.push(owner);
				},
			},
		};

		document.body.innerHTML = `<script id="__ECO_PAGE_DATA__" type="application/json">${JSON.stringify({
			title: 'Hello React',
			locals: { theme: 'dark' },
		})}</script>`;

		const script = createHydrationScript({
			...runtimeModules,
			isDevelopment: true,
			isMdx: false,
			router: routerAdapter,
		});

		await importModule(createModuleUrl(script));

		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.hydrateCalls).toHaveLength(1);
		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.hydrateCalls[0]?.containerTag).toBe('BODY');
		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.hydrateCalls[0]?.hasRecoverableErrorHandler).toBe(true);
		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.claimedOwners).toEqual(['react-router']);
		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.registrations).toHaveLength(1);
		expect(typeof testWindow.__ECO_PAGES__?.react?.cleanupPageRoot).toBe('function');
		expect(testWindow.__ECO_PAGES__?.page).toEqual({
			module: runtimeModules.importPath,
			props: {
				title: 'Hello React',
				locals: { theme: 'dark' },
			},
		});

		await testWindow.__ECO_PAGES__?.react?.cleanupPageRoot?.();

		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.unmountCount).toBe(1);
		expect(testWindow.__ECO_REACT_HYDRATION_TEST__?.releasedOwners).toEqual(['react-router']);
		expect(testWindow.__ECO_PAGES__?.page).toBeUndefined();
		expect(testWindow.__ECO_PAGES__?.react?.pageRoot).toBeNull();
	});
});
