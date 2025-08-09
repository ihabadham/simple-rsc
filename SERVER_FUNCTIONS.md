# Server Functions for this Minimal RSC Stack

This guide shows how to implement React 19 Server Functions (aka Server Actions) in this codebase while preserving our current patterns:

- Keep business logic on the server
- Reuse the RSC stream to refresh the UI after mutations
- Do not bundle server code to the client

It aligns with the React 19 docs but stays framework‑agnostic and compatible with our `esbuild` flow.

---

## Goals and constraints

- React 19.x (current in `package.json`).
- Client Components may call Server Functions; UI refreshes via streamed RSC.
- Prefer module‑authored functions under `app/actions/*.js` with `"use server"`.
- Keep v1 simple: no optimistic UI, no passive tab updates, no return‑value channel.

---

## Authoring Server Functions

Two supported authoring styles:

- Module‑level functions in `app/actions/*.js` with a top‑level `"use server"` directive
- Inline functions inside Server Components whose body starts with `"use server"`

```js
// app/actions/album.js
'use server';
import { getValue, setValue } from '../../server/state.js';

export async function likeAlbum(albumId) {
	const key = `like-${albumId}`;
	const current = getValue(key, 0);
	setValue(key, current + 1);
}
```

```jsx
// app/page.jsx (server component)
export default async function Page() {
	async function createNote() {
		'use server';
		// mutate on the server (DB, state, etc.)
	}
	// Pass as a prop to a client boundary or form (see usage below)
	return null;
}
```

Notes:

- Keep server‑only imports near the server function (DB/state modules, etc.).
- Never import client‑only code into files that declare `"use server"`.

---

## Transport: one POST endpoint to execute functions and stream RSC

Add a single endpoint that:

1. Resolves a server function by id
2. Executes it with args
3. Streams a fresh RSC payload for the UI refresh

Signature (conceptual):

```http
POST /server-fn
{ id: string, args: any[] }
```

Response: RSC stream (`text/x-component`), which the client will feed into `window.__renderRSC`.

This matches our existing pattern for mutations and avoids shipping server code to the browser.

---

## Client runtime glue

Expose a generic caller for server functions and continue to use our existing `renderRSC` entry point.

```js
// app/_client.jsx (concept)
async function callServerFunction(id, args) {
	const resp = await fetch('/server-fn', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ id, args })
	});
	return resp; // pass to __renderRSC
}

// @ts-expect-error global attach
window.__callServerFunction = callServerFunction;
```

Usage from a Client Component:

```jsx
'use client';
import { startTransition } from 'react';
import { likeAlbum } from '../actions/album.js';

export default function Like({ albumId }) {
	async function onClick() {
		const resp = await likeAlbum(albumId); // proxy, see build wiring below
		startTransition(() => window.__renderRSC(resp));
	}
	return <button onClick={onClick}>♥ Like</button>;
}
```

Form usage with `action={serverFn}` is also supported by emitting a proxy that accepts form data and posts through the same endpoint; for v1 we keep examples button‑based for clarity.

---

## Build‑time wiring with esbuild

We need tiny build transforms to make this ergonomic:

- Detect `"use server"` modules
- Server build: keep them server‑only and auto‑register exports
- Client build: when imported from client code, replace with stubs that call the transport and tag metadata

### Server build: register server functions

- Parse `export` names from `"use server"` files
- For each export, compute an id `<virtual-path>#<exportName>`
- Append code that registers the function id with a small registry

Registry (runtime):

```js
// server/server-functions.js
const registry = new Map(); // id -> function
export function registerServerFunction(id, fn) {
	registry.set(id, fn);
}
export function getServerFunction(id) {
	const fn = registry.get(id);
	if (!fn) throw new Error(`Server function not found: ${id}`);
	return fn;
}
```

### Client build: proxy stubs for imports of `"use server"` modules

- When a client component imports a `"use server"` module, emit a virtual module that exports thin proxies
- Each proxy calls `window.__callServerFunction(id, args)` and returns the `Response` so callers can hand it to `__renderRSC`
- Attach metadata for tooling: `fn.$$id = id; fn.$$typeof = Symbol.for('react.server.reference')`

These transforms mirror the React docs idea of server references without bundling server code into the client.

---

## Respecting our existing patterns

- Keep the “mutate → stream new RSC → client swaps” loop (no JSON return channel in v1)
- Continue externalizing server‑only modules like `../server/state.js` from the server component build
- Tag proxies with `$$id`/`$$typeof` for clarity and future tooling

---

## Security, headers, and errors

- Validate/sanitize inputs to `/server-fn`
- Consider CSRF/auth depending on environment
- Prefer explicit response headers on the action response:
  - `Content-Type: text/x-component`
  - `Cache-Control: no-store`
- Wrap server execution in `try/catch`; stream an error boundary or return a 500 JSON for now

---

## Limitations (v1)

- No `useActionState`/return‑value channel; we refresh the whole tree via RSC
- Only the calling tab refreshes; add SSE/WebSocket for passive tab updates
- Inline `"use server"` works but prefer `app/actions/*.js` for clarity

---

## Checklist to implement

1. Add `server/server-functions.js` (registry)
2. Add `POST /server-fn` route that executes by id and streams a fresh RSC payload
3. Add `window.__callServerFunction` to `app/_client.jsx`
4. Extend server build to auto‑register exports of `"use server"` modules
5. Extend client build to emit proxy stubs for imports of `"use server"` modules
6. Author server functions in `app/actions/*.js`; call them from client code inside `startTransition(() => __renderRSC(resp))`
