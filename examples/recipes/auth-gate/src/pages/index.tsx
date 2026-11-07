import { eco } from '@ecopages/core';

export default eco.page({
	metadata: () => ({ title: 'Auth-gated layout', description: 'A layout that gates its page on the session.' }),
	render: () => (
		<main>
			<h1>Auth-gated layout</h1>
			<a href="/dashboard">Dashboard</a> <a href="/account">Account</a>
		</main>
	),
});
