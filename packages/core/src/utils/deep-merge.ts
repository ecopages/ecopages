/**
 * This module contains a simple utility function to merge two objects deeply
 * @module
 */

function isObject(item: any): item is Record<string, unknown> {
	return item && typeof item === 'object' && !Array.isArray(item);
}

function isArray(item: any): item is unknown[] {
	return Array.isArray(item);
}

/**
 * Deeply merges two objects or arrays
 * @function deepMerge
 * @template T - Type of target object
 * @template U - Type of source object
 * @param target - The target object to merge into
 * @param source - The source object to merge from
 * @returns A new object with merged properties
 */
export function deepMerge<T, U>(target: T, source: U): T & U {
	if (isArray(target) && isArray(source)) {
		return [...target, ...source] as T & U;
	}

	if (!isObject(target) || !isObject(source)) {
		return source as T & U;
	}

	const output = Object.assign({}, target) as T & U;
	for (const key in source) {
		if (isObject((source as any)[key])) {
			if (!(target as any)[key]) {
				Object.assign(output as object, { [key]: (source as any)[key] });
			} else {
				output[key as keyof T] = deepMerge((target as any)[key], (source as any)[key]);
			}
		} else if (isArray((source as any)[key])) {
			output[key as keyof T] = [...((target as any)[key] || []), ...(source as any)[key]] as (T & U)[keyof T];
		} else if ((source as any)[key] !== undefined) {
			Object.assign(output as object, { [key]: (source as any)[key] });
		}
	}
	return output;
}
