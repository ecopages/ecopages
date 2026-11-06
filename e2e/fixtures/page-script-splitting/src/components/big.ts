export const bigEntries = Array.from(
	{ length: 3000 },
	(_, index) => `PSS_BIG_MARKER_${index}_${(index * 7919).toString(36)}`,
);
