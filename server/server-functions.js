// server/server-functions.js – simple registry for server functions
const registry = new Map(); // id -> function

export function registerServerFunction(id, fn) {
	registry.set(id, fn);
}

export function getServerFunction(id) {
	const fn = registry.get(id);
	if (!fn) throw new Error(`Server function not found: ${id}`);
	return fn;
}
