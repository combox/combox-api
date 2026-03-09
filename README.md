# ComBox API SDK

[English](./README.md) | [Русский](./README.ru.md)

TypeScript client library for ComBox frontend apps. It wraps backend HTTP endpoints, auth/session storage, realtime helpers, normalized model helpers, and message-content utilities.

## What it does

- register / login / refresh / logout
- profile, password, email change, profile settings
- chats, messages, reactions, channels/topics
- media attachments and sessions
- GIF integration helpers
- bot tokens and bot webhooks
- presence helpers
- local auth/profile persistence
- WebSocket/realtime helpers
- normalized message/profile helpers

## Package surface

Main exports:

- `comboxApi.ts` - functional API
- `client.ts` - `ComboxClient` class wrapper
- `realtime.ts` - realtime helpers
- `messageContent.ts` - content parsing/formatting helpers
- `normalized.ts` - normalization utilities
- `storage.ts` - local storage helpers
- `comboxApi.types.ts` - shared public types

Entry point:

```ts
import { ComboxClient, login, getProfile, connectRealtime } from 'combox-api'
```

## Build

```bash
npm install
npm run build
```

Scripts:

- `npm run check` - TypeScript type check without emitting files
- `npm run build` - compile TypeScript into `dist/`
- `npm run prepare` - build on package prepare

## Runtime behavior

By default the package infers URLs from the browser environment:

- API base defaults to `/api/private/v1`
- WS base defaults to browser-derived websocket endpoint

Supported env overrides:

- `VITE_API_BASE_URL`
- `VITE_WS_BASE_URL`

## Main concepts

### Functional API

Use direct functions like:

- `login`
- `register`
- `getProfile`
- `updateProfile`
- `listChats`
- `listMessages`
- `createMessage`

### `ComboxClient`

`ComboxClient` provides an object-oriented wrapper over the same API surface. It is useful when apps want one client instance instead of importing many functions.

### Auth persistence

The package stores:

- auth snapshot in local storage
- local profile snapshot for frontend convenience

Helpers include:

- `getCurrentUser()`
- `getAccessToken()`
- `isAuthenticated()`
- `forceRefreshSession()`
- `clearAuth()`

## Project layout

- `src/index.ts` - package export surface
- `src/comboxApi.ts` - main functional API
- `src/client.ts` - `ComboxClient`
- `src/realtime.ts` - realtime transport helpers
- `src/messageContent.ts` - message content parsing
- `src/normalized.ts` - normalization helpers
- `src/storage.ts` - storage helpers
- `src/comboxApi.types.ts` - public types

## Output

Build artifacts are emitted to:

- `dist/index.js`
- `dist/index.d.ts`

The package exports only `dist/`.

## Notes

- this package is browser-oriented
- it assumes `window`, `localStorage`, and browser `fetch`/`WebSocket` semantics where relevant
- client and functional APIs should stay contract-compatible

## Releases

- publishing is automated by [release.yml](/C:/Users/Ernela/Projects/combox-api/.github/workflows/release.yml)
- create a GitHub Release with tag `vX.Y.Z` that matches `package.json`
- stable releases publish to npm with the `latest` tag
- prereleases publish to npm with the `next` tag
- the repository must define an `NPM_TOKEN` secret with publish access for the package

## License

<a href="./LICENSE">
  <img src=".github/assets/mit-badge.png" width="70" alt="MIT License">
</a>

## Author

[Ernela](https://github.com/Ernous) - Developer;
[D7TUN6](https://github.com/D7TUN6) - Idea, Developer
