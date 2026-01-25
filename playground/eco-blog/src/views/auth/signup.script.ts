(() => {
	const form = document.querySelector('form');
	if (form) {
		form.addEventListener('submit', async (e) => {
			e.preventDefault();
			const formData = new FormData(form);
			const data = Object.fromEntries(formData.entries());
			const callbackURL = formData.get('callbackURL') || '/admin';

			try {
				const res = await fetch(form.action, {
					method: form.method,
					body: JSON.stringify(data),
					headers: {
						'Content-Type': 'application/json',
					},
				});

				if (res.ok) {
					window.location.href = callbackURL as string;
				} else {
					const error = await res.json();
					alert(error.message || 'Signup failed');
				}
			} catch (err) {
				console.error('Signup error:', err);
				alert('An unexpected error occurred');
			}
		});
	}
})();
