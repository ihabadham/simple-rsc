# Enabling **Server Actions** in a Minimal React-Server-Components (RSC) Stack

This guide describes _one clear, framework-agnostic path_ to add **mutations that run on the server and trigger an immediate UI refresh** using the existing RSC transport.  
It stays generic – no reference to any particular component – so you can reuse the pattern for counters, forms, todos, etc.

---

## 1 Keep Mutable State on the Server

```js
// server/state.js – simple in-memory store (swap for a real DB later)
const store = new Map(); // key -> arbitrary value

export function getValue(key, defaultVal = 0) {
	return store.get(key) ?? defaultVal;
}

export function setValue(key, val) {
	store.set(key, val);
}
```

_Why_: The browser becomes a _pure view layer_. All business rules live on the server, guaranteeing a single source of truth.

---

## 2 Create a **Server-Action Endpoint**

Expose a POST route that:

1. Runs your mutation (write to DB / Map / etc.)
2. Immediately streams back a **fresh RSC payload**

```js
// server.js – after the GET /rsc handler
import { setValue } from './server/state.js';

app.post('/actions/:name', async (c) => {
	const { name } = c.req.param(); // e.g. "incrementCounter"
	const body = await c.req.json(); // optional action args

	// 1️⃣  Execute business logic (example: increment a counter)
	const current = getValue(name, 0);
	setValue(name, current + 1);

	// 2️⃣  Stream back an updated component tree
	const Page = await import('./build/page.js');
	const stream = renderToPipeableStream(createElement(Page.default), '');
	stream.pipe(c.env.outgoing);
	return RESPONSE_ALREADY_SENT;
});
```

_Why_: Merging read & write into the same RSC channel means no extra REST/GraphQL layer and no cache-invalidation headaches.

---

## 3 Expose a **Reusable Client Helper**

Your bootstrap already renders a stream fetched from `/rsc`.  
Wrap that logic so any Response (from GET _or_ POST) can be consumed the same way.

```jsx
// app/_client.jsx  (simplified)
import { createRoot } from 'react-dom/client';
import { createFromFetch } from 'react-server-dom-esm/client';

const root = (window.__rscRoot = createRoot(document.getElementById('root')));

function renderRSC(src) {
	// src can be a URL string *or* a Response object
	const promise = typeof src === 'string' ? fetch(src) : Promise.resolve(src);
	createFromFetch(promise).then((node) => root.render(node));
}

window.__renderRSC = renderRSC; // export for client components

renderRSC('/rsc'); // initial page load
```

_Why_: A single function handles "initial render" **and** "re-render after an action".

---

## 4 Pattern for a Client Component that Calls a Server Action

```jsx
'use client';
import { startTransition } from 'react';

export default function ActionButton({ actionName, children }) {
	async function run() {
		const resp = await fetch(`/actions/${actionName}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				/* arbitrary args */
			})
		});

		// Swap in the new tree without blocking UI
		startTransition(() => window.__renderRSC(resp));
	}

	return <button onClick={run}>{children}</button>;
}
```

_Why_: The browser never updates local state directly; it always waits for the authoritative server stream.

---

## 5 Use the Updated Server Data in Your Server Components

```jsx
// app/page.jsx  (server component)
import { getValue } from '../server/state.js';

export default async function Page() {
	const count = getValue('incrementCounter');
	return (
		<>
			<h1>Counter demo (shared across tabs)</h1>
			<p>Server value: {count}</p>
			{/* Render the client action button */}
			<ActionButton actionName="incrementCounter">+1</ActionButton>
		</>
	);
}
```

_Outcome_: Click the button → POST → server mutates → new RSC stream → UI updates in every tab that performs the action.

---

## 6 Demo Checklist

1. `npm run dev` (or your start script)
2. Open **two** browser tabs → both show identical value.
3. Click the button in tab 1 → both tabs refresh to the new value without reload.
4. Refresh either tab → value persists (thanks to server-side storage).

---

## 7 Keep It Core

_Optional_ areas **not** covered here (on purpose):

- Authentication & per-user state
- Optimistic UI for slow actions
- Database drivers, ORMs, or migrations
- Fine-grained (subtree-only) streaming with `useOptimistic` or `@react/server` helpers

Stick to the minimal loop above to demonstrate that you understand:

1. Server-only business logic
2. Streaming the updated component tree
3. Auto UI re-render on the client – the _essence_ of React Server Components.
