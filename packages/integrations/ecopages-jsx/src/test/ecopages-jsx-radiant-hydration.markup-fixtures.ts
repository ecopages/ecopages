// Committed browser hydration fixtures. Regenerate when Radiant SSR output changes.
export const radiantHydrationMarkupFixtures = {
	tagNames: {
		elementHydrate: 'ecopages-jsx-radiant-counter-hydrate',
		elementFallback: 'ecopages-jsx-radiant-counter-fallback',
		controllerActivation: 'ecopages-jsx-controller-counter-activation',
	},
	markups: {
		elementHydrate:
			'<ecopages-jsx-radiant-counter-hydrate><button data-radiant-jsx-bind-0="attr:data-testid" data-testid="counter">1</button><script type="application/json" data-hydration data-hydration-type="signal" data-hydration-key="count">1</script></ecopages-jsx-radiant-counter-hydrate>',
		elementFallback:
			'<ecopages-jsx-radiant-counter-fallback><button data-radiant-jsx-bind-0="attr:data-testid" data-testid="counter">1</button><script type="application/json" data-hydration data-hydration-type="signal" data-hydration-key="count">1</script></ecopages-jsx-radiant-counter-fallback>',
		controllerActivation:
			'<section data-controller="ecopages-jsx-controller-counter-activation"><button data-radiant-jsx-bind-0="attr:data-testid" data-testid="controller-counter">1</button></section>',
	},
} as const;
