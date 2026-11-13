import { Effect } from 'effect';

const signInWithGithub = Effect.gen(function* () {
	const start = yield* Effect.promise((signal) => fetch('/auth/github/start', { method: 'POST', signal }));
	if (!start.ok) return yield* Effect.fail('Could not start sign-in.');
	const flow = yield* Effect.promise(() => start.text());

	while (true) {
		yield* Effect.sleep('1500 millis');
		const claim = yield* Effect.promise((signal) =>
			fetch('/auth/github/claim', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: flow,
				signal,
			}),
		);
		if (claim.status === 204) return;
		if (claim.status !== 202) return yield* Effect.fail('Sign-in did not finish.');
	}
}).pipe(Effect.timeout('5 minutes'));

const button = document.querySelector<HTMLButtonElement>('#github-sign-in');
const statusMessage = document.querySelector<HTMLParagraphElement>('#github-status');

if (button && statusMessage) {
	button.addEventListener('click', () => {
		button.disabled = true;
		statusMessage.hidden = false;
		statusMessage.textContent = 'Complete sign-in in your browser.';

		void Effect.runPromise(signInWithGithub).then(
			() => location.assign('/dashboard'),
			() => {
				statusMessage.textContent = 'GitHub sign-in did not finish. Try again.';
				button.disabled = false;
			},
		);
	});
}
