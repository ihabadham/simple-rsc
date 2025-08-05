// server/state.js – simple in-memory store (swap for a real DB later)
const store = new Map(); // key -> arbitrary value

export function getValue(key, defaultVal = 0) {
	return store.get(key) ?? defaultVal;
}

export function setValue(key, val) {
	store.set(key, val);
}
