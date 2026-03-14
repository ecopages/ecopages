import { eco } from '@ecopages/core';
import { ReactNode } from 'react';

type User = {
	id: string;
	name: string | null;
	email: string;
};

type DashboardContentProps = {
	user: User;
};

export const DashboardContent = eco.component<DashboardContentProps, ReactNode>({
	dependencies: {
		stylesheets: ['./dashboard-content.css'],
	},
	render: ({ user }) => {
		return (
			<div className="dashboard-content">
				<section className="dashboard-content__card">
					<h2 className="dashboard-content__heading">Your account</h2>
					<dl className="dashboard-content__list">
						<div>
							<dt className="dashboard-content__list-item-label">Name</dt>
							<dd className="dashboard-content__list-item-value">{user.name ?? '—'}</dd>
						</div>
						<div>
							<dt className="dashboard-content__list-item-label">Email</dt>
							<dd className="dashboard-content__list-item-value">{user.email}</dd>
						</div>
					</dl>
				</section>
				<p className="dashboard-content__footer">
					<a href="/" className="dashboard-content__link">
						Back to home
					</a>
				</p>
			</div>
		);
	},
});
