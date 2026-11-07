import { eco } from '@ecopages/core';

export default eco.page({
	metadata: () => ({ title: 'Sign in', description: 'The sign-in page.' }),
	render: () => (
		<main>
			<h1>Sign in</h1>
			<form method="post" action="/api/sign-in">
				<button type="submit">Sign in</button>
			</form>
		</main>
	),
});
