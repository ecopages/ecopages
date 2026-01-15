declare module 'idiomorph' {
	interface HeadConfig {
		style?: 'merge' | 'append' | 'morph' | 'none';
		block?: boolean;
		ignore?: boolean;
		shouldPreserve?: (element: Element) => boolean;
		shouldReAppend?: (element: Element) => boolean;
		shouldRemove?: (element: Element) => boolean;
		afterHeadMorphed?: (element: Element, info: { added: Node[]; kept: Element[]; removed: Element[] }) => void;
	}

	interface MorphCallbacks {
		beforeNodeAdded?: (node: Node) => boolean;
		afterNodeAdded?: (node: Node) => void;
		beforeNodeMorphed?: (oldNode: Node, newNode: Node) => boolean;
		afterNodeMorphed?: (oldNode: Node, newNode: Node) => void;
		beforeNodeRemoved?: (node: Node) => boolean;
		afterNodeRemoved?: (node: Node) => void;
		beforeAttributeUpdated?: (
			attributeName: string,
			element: Element,
			mutationType: 'update' | 'remove',
		) => boolean;
	}

	interface MorphConfig {
		morphStyle?: 'outerHTML' | 'innerHTML';
		ignoreActive?: boolean;
		ignoreActiveValue?: boolean;
		restoreFocus?: boolean;
		callbacks?: MorphCallbacks;
		head?: HeadConfig;
	}

	export const Idiomorph: {
		morph: (
			oldNode: Element | Document,
			newContent: Element | Node | NodeList | string | null,
			config?: MorphConfig,
		) => Node[] | undefined;
		defaults: MorphConfig;
	};
}
