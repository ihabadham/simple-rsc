# React Server Components + Server Functions ⚛️

> A simple approach implementation to React Server Components with React 19 Server Functions, built from scratch using esbuild.

[Watch the "build from scratch" code-along video](https://www.youtube.com/watch?v=MaebEqhZR84) to learn how all of the pieces fit together. Or... just read the in-line documentation in this codebase :)

- **Server Component streaming** via `react-server-dom-esm`
- **Client Component bundling** with `"use client"` directive handling
- **Server Functions** with `"use server"` directive and build-time transforms
- **Shared state** between server functions and components
- **Natural import syntax** for server functions from client components

## 🚀 Getting Started

```bash
npm install
npm run dev
```

This should trigger a build and start your server at http://localhost:3000.

### Developer note on the `dev` script

You'll notice the `dev` script maps to the following command in the `package.json`:

```bash
node --conditions react-server server.js
```

The `--conditions` flag is part of the [Node.js conditional exports system](https://nodejs.org/api/cli.html#-c-condition---conditionscondition). This allows packages to export different versions of a module depending on your environment.

When passed `react-server`, `react-server-dom-esm` will expose a server-only module that omits React's client-side or browser-specific APIs, ensuring compatibility with the server-rendered environment.

## 🏗️ Architecture Overview

### Build Process Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Source Code   │    │   Build Process  │    │   Runtime       │
├─────────────────┤    ├──────────────────┤    ├─────────────────┤
│                 │    │                  │    │                 │
│ app/page.jsx    │───▶│ Server Bundle    │───▶│ Server Renders  │
│ (Server Comp)   │    │ + RSC Streaming  │    │ & Streams RSC   │
│                 │    │                  │    │                 │
│ app/Like.jsx    │───▶│ Client Bundle    │───▶│ Browser Hydrates│
│ ("use client")  │    │ + Client Refs    │    │ & Handles UI    │
│                 │    │                  │    │                 │
│ app/actions/    │───▶│ Server Registry  │───▶│ Function Lookup │
│ ("use server")  │    │ + Client Proxies │    │ & Execution     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Runtime Execution Flow

```
1. User clicks ♥ Like button
   ↓
2. Client calls: await likeAlbum(albumId)
   ↓ (Build transform replaces with proxy)
3. Proxy calls: window.__callServerFunction('actions/album.js#likeAlbum', [albumId])
   ↓
4. POST /server-fn → Server registry lookup → Execute real function
   ↓
5. Server streams fresh RSC payload
   ↓
6. Client renders updated UI with new like count
```

## 🔧 Technical Implementation

### Server Component Bundling

- **Entry point**: `app/page.jsx`
- **External modules**: Shared state and registry modules stay external
- **Output**: Server-renderable components that stream RSC to browser

### Client Component Detection & Bundling

- **Detection**: esbuild plugin scans for `"use client"` directive
- **Transform**: Marks as external in server build, includes in client build
- **References**: Auto-generates `$$typeof` and `$$id` metadata per React spec
- **Output**: Browser-compatible bundles with component references

### Server Functions Implementation

- **Detection**: esbuild plugin scans for `"use server"` directive
- **Server transform**: Auto-registers functions in runtime registry
- **Client transform**: Replaces imports with proxy stubs that call transport
- **Transport**: Single `POST /server-fn` endpoint with function lookup
- **State sharing**: External modules ensure server functions and components share state

## 📁 Project Structure

```
app/
├── page.jsx          # Server component (streams RSC)
├── Like.jsx          # Client component ("use client")
├── _client.jsx       # Client bootstrap + RSC hydration
└── actions/
    └── album.js      # Server functions ("use server")

server/
├── state.js          # Shared state (external module)
└── server-functions.js # Function registry (external module)

server.js             # Build process + Hono server + RSC streaming
```

## 🎯 Key Features Demonstrated

### 1. Natural Server Function Syntax

```jsx
// Client component can import and call server functions naturally
import { likeAlbum } from './actions/album.js';

export default function Like({ albumId }) {
  async function handleLike() {
    const resp = await likeAlbum(albumId); // Feels like a normal function!
    startTransition(() => window.__renderRSC(resp));
  }
  return <button onClick={handleLike}>♥ Like</button>;
}
```

### 2. Build-Time Transforms

- **Server functions** get auto-registered: `registerServerFunction('actions/album.js#likeAlbum', likeAlbum)`
- **Client imports** get replaced with proxies that call `window.__callServerFunction`
- **No manual wiring** - the build process handles everything

### 3. Shared State Architecture

```jsx
// Server function modifies shared state
export async function likeAlbum(albumId) {
  const current = getValue(`like-${albumId}`, 0);
  setValue(current + 1); // Updates shared state
}

// Server component reads same shared state
const likes = getValue(`like-${albumId}`, 0); // Sees the update!
```

### 4. RSC Streaming Integration

- Server functions execute → Fresh RSC stream → Client updates UI
- No separate JSON API needed - server functions reuse RSC transport
- Maintains React's declarative paradigm

## 🔍 Technical Deep Dive

### Build Plugins

- **`resolve-client-imports`**: Detects `"use client"` and marks as external for server build
- **`register-server-functions`**: Auto-registers `"use server"` exports during server build
- **`server-functions-proxy-client`**: Replaces server function imports with client proxies

### Runtime Components

- **Server registry**: Maps function IDs to executable functions
- **Client transport**: `window.__callServerFunction` handles network calls
- **RSC integration**: `window.__renderRSC` handles UI updates

This implementation is a simplified approach that follows React 19 Server Functions specifications while remaining framework-agnostic and educational.

## What is _not_ included?

- **File-based routing conventions.** This repo includes a _single_ index route, with support for processing query params. If you need multiple routes, you can try [NextJS' new `app/` directory.](https://beta.nextjs.org/docs/routing/defining-routes)
- **Advanced bundling for CSS-in-JS.** [A Tailwind script](https://tailwindcss.com/docs/installation/play-cdn) is included for playing with styles.
- **Advice on production deploys.** This is a learning tool to show how React Server Components are used, not the bedrock for your next side project. See [React's updated "Start a New React Project" guide](https://react.dev/learn/start-a-new-react-project) for advice on building production-ready apps.
