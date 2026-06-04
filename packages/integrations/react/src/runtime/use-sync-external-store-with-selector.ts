/* eslint-disable react-hooks/exhaustive-deps -- shim mirrors upstream ref-based hook semantics */
import { useDebugValue, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

const objectIs = Object.is;

type Subscribe = (onStoreChange: () => void) => () => void;

type SelectorInst<Selection> =
	| {
			hasValue: false;
			value: undefined;
	  }
	| {
			hasValue: true;
			value: Selection;
	  };

export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
	subscribe: Subscribe,
	getSnapshot: () => Snapshot,
	getServerSnapshot: (() => Snapshot) | undefined,
	selector: (snapshot: Snapshot) => Selection,
	isEqual?: (left: Selection, right: Selection) => boolean,
): Selection {
	const instRef = useRef<SelectorInst<Selection>>({ hasValue: false, value: undefined });

	const memoizedSelectionRef = useMemo(() => {
		let hasMemo = false;
		let memoizedSnapshot: Snapshot;
		let memoizedSelection: Selection;
		const maybeGetServerSnapshot = getServerSnapshot === undefined ? null : getServerSnapshot;

		const memoizedSelector = (nextSnapshot: Snapshot): Selection => {
			if (!hasMemo) {
				hasMemo = true;
				memoizedSnapshot = nextSnapshot;
				const nextSelection = selector(nextSnapshot);
				const inst = instRef.current;

				if (isEqual !== undefined && inst.hasValue) {
					const currentSelection = inst.value;
					if (isEqual(currentSelection, nextSelection)) {
						memoizedSelection = currentSelection;
						return currentSelection;
					}
				}

				memoizedSelection = nextSelection;
				return nextSelection;
			}

			const currentSelection = memoizedSelection;
			if (objectIs(memoizedSnapshot, nextSnapshot)) {
				return currentSelection;
			}

			const nextSelection = selector(nextSnapshot);
			if (isEqual !== undefined && isEqual(currentSelection, nextSelection)) {
				memoizedSnapshot = nextSnapshot;
				return currentSelection;
			}

			memoizedSnapshot = nextSnapshot;
			memoizedSelection = nextSelection;
			return nextSelection;
		};

		return [
			() => memoizedSelector(getSnapshot()),
			maybeGetServerSnapshot === null ? undefined : () => memoizedSelector(maybeGetServerSnapshot()),
		] as const;
	}, [getSnapshot, getServerSnapshot, selector, isEqual]);

	const value = useSyncExternalStore(subscribe, memoizedSelectionRef[0], memoizedSelectionRef[1]);

	useEffect(() => {
		instRef.current = {
			hasValue: true,
			value,
		};
	}, [value]);

	useDebugValue(value);
	return value;
}
