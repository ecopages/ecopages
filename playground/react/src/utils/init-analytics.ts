/**
 * This is a global side effect
 */
console.log('Analytics initialized! (This should not run if pruned)');

export function trackEvent(name: string) {
	console.log(`Tracked: ${name}`);
}
