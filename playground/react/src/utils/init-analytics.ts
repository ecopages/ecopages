/**
 * This is a global side effect
 */
console.log('Analytics initialized! (This should not run on the client if pruned)');

export function trackEvent(name: string) {
	console.log(`Tracked: ${name}`);
}
