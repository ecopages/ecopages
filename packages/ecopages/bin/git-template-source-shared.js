export function repositoryName(value) {
	return value.replace(/\.git$/u, '');
}

export function withSubpath(repository, subpath) {
	return subpath.length > 0 ? `${repository}/${subpath.join('/')}` : repository;
}
