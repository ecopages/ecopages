import { eco } from '@ecopages/core';
import type { PropsWithChildren } from '@kitajs/html';

const SignUp = eco.page<PropsWithChildren<{}>>({
	metadata: () => ({
		title: 'Sign Up | EcoBlog',
		description: 'Create an author account',
	}),
	dependencies: {
		scripts: ['./signup.script.ts'],
	},
	render: () => {
		return (
			<body class="bg-slate-50 min-h-screen flex items-center justify-center p-4 antialiased font-sans">
				<div class="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-slate-200">
					<div class="text-center mb-8">
						<a
							href="/"
							class="text-3xl font-black italic bg-linear-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent mb-2 inline-block"
						>
							EcoBlog
						</a>
						<h1 class="text-2xl font-bold text-slate-900">Create Account</h1>
						<p class="text-slate-500 mt-2">Join the revolution of conscious writing</p>
					</div>

					<form action="/api/auth/sign-up/email" method="POST" class="space-y-4">
						<div class="space-y-1">
							<label class="text-sm font-semibold text-slate-700 ml-1">Full Name</label>
							<input
								type="text"
								name="name"
								required
								class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
								placeholder="John Doe"
							/>
						</div>
						<div class="space-y-1">
							<label class="text-sm font-semibold text-slate-700 ml-1">Email Address</label>
							<input
								type="email"
								name="email"
								required
								class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
								placeholder="name@example.com"
							/>
						</div>
						<div class="space-y-1">
							<label class="text-sm font-semibold text-slate-700 ml-1">Password</label>
							<input
								type="password"
								name="password"
								required
								class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
								placeholder="••••••••"
							/>
						</div>

						<input type="hidden" name="callbackURL" value="/admin" />

						<button
							type="submit"
							class="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] mt-4"
						>
							Create Author Account
						</button>
					</form>

					<p class="text-center text-slate-500 text-sm mt-8">
						Already have an account?{' '}
						<a href="/login" class="text-indigo-600 font-bold hover:text-indigo-500">
							Sign in
						</a>
					</p>
				</div>
			</body>
		);
	},
});

export default SignUp;
