export function quantile(sorted, q) {
	if (sorted.length === 0) {
		return 0;
	}

	const idx = (sorted.length - 1) * q;
	const lo = Math.floor(idx);
	const hi = Math.ceil(idx);
	if (lo === hi) {
		return sorted[lo];
	}

	return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function summarize(durations) {
	const sorted = [...durations].sort((left, right) => left - right);
	const sum = sorted.reduce((total, value) => total + value, 0);
	return {
		count: sorted.length,
		min: sorted[0] ?? 0,
		max: sorted[sorted.length - 1] ?? 0,
		mean: sorted.length > 0 ? sum / sorted.length : 0,
		median: quantile(sorted, 0.5),
		p95: quantile(sorted, 0.95),
	};
}
