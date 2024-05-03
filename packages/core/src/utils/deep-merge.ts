function isObject(item: any): item is Record<string, unknown> {
  return item && typeof item === 'object' && !Array.isArray(item);
}

export function deepMerge<T extends Record<string, unknown>, U extends Record<string, unknown>>(
  target: T,
  source: U,
): T & U {
  if (!isObject(target)) {
    return source as T & U;
  }

  const output = Object.assign({}, target) as T & U;
  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject((source as U)[key])) {
        if (!(target as T)[key]) {
          Object.assign(output as T & U, { [key]: (source as U)[key] });
        } else {
          (output as T & U)[key] = deepMerge((target as any)[key], (source as any)[key]);
        }
      } else if ((source as U)[key] !== undefined) {
        Object.assign(output as T & U, { [key]: (source as U)[key] });
      }
    }
  }
  return output;
}
