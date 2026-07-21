import type { DevToolbarBadge } from '../api/types.ts';

export function badgesEqual(left: DevToolbarBadge | undefined, right: DevToolbarBadge | undefined): boolean {
	if (left === right) {
		return true;
	}

	if (!left || !right) {
		return false;
	}

	return left.count === right.count && left.severity === right.severity;
}
