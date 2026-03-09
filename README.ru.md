# ComBox API SDK

[![Code Quality](https://github.com/combox/combox-api/actions/workflows/security.yml/badge.svg)](https://github.com/combox/combox-api/actions/workflows/security.yml)

[English](./README.md) | [Русский](./README.ru.md)

TypeScript client library для фронтендов ComBox. Она оборачивает backend HTTP endpoints, auth/session storage, realtime helpers, normalized model helpers и message-content utilities.

## Что умеет

- register / login / refresh / logout
- profile, password, email change, profile settings
- chats, messages, reactions, channels/topics
- media attachments и sessions
- GIF integration helpers
- bot tokens и bot webhooks
- presence helpers
- локальное хранение auth/profile
- WebSocket/realtime helpers
- normalized message/profile helpers

## Поверхность пакета

Основные exports:

- `comboxApi.ts` - functional API
- `client.ts` - class wrapper `ComboxClient`
- `realtime.ts` - realtime helpers
- `messageContent.ts` - content parsing/formatting helpers
- `normalized.ts` - normalization utilities
- `storage.ts` - local storage helpers
- `comboxApi.types.ts` - общие публичные типы

Точка входа:

```ts
import { ComboxClient, login, getProfile, connectRealtime } from 'combox-api'
```

## Сборка
```bash
npm install
npm run build
```

## Скрипты

- `npm run check` - TypeScript-проверка без генерации файлов
- `npm run build` - компиляция TypeScript в `dist/`
- `npm run prepare` - сборка на package prepare

## Runtime-поведение

По умолчанию пакет выводит URL из browser environment:

- API base по умолчанию `/api/private/v1`
- WS base по умолчанию вычисляется из browser websocket endpoint

Поддерживаемые env overrides:

- `VITE_API_BASE_URL`
- `VITE_WS_BASE_URL`

## Основные концепции

### Functional API

Можно использовать прямые функции:

`login`
`register`
`getProfile`
`updateProfile`
`listChats`
`listMessages`
`createMessage`

### `ComboxClient`

`ComboxClient` даёт объектную обёртку над тем же API. Это удобно, когда приложению нужен один client instance вместо множества импортируемых функций.

### Auth persistence

Пакет хранит:

- auth snapshot в local storage
- local profile snapshot для удобства фронтенда

Есть helpers:

- `getCurrentUser()`
- `getAccessToken()`
- `isAuthenticated()`
- `forceRefreshSession()`
- `clearAuth()`

## Структура проекта

- `src/index.ts` - export surface пакета
- `src/comboxApi.ts` - основной functional API
- `src/client.ts` - `ComboxClient`
- `src/realtime.ts` - realtime transport helpers
- `src/messageContent.ts` - parsing содержимого сообщений
- `src/normalized.ts` - normalization helpers
- `src/storage.ts` - storage helpers
- `src/comboxApi.types.ts` - публичные типы

## Выход сборки

Артефакты сборки пишутся в:

- `dist/index.js`
- `dist/index.d.ts`

Пакет экспортирует только `dist/`.

## Заметки
-
- пакет ориентирован на browser runtime
- он предполагает наличие `window`, `localStorage`, `fetch` и браузерной семантики `WebSocket`, где это нужно
- class API и functional API должны оставаться совместимыми по контракту
-
## Релизы

- публикация автоматизирована через [release.yml](/C:/Users/Ernela/Projects/combox-api/.github/workflows/release.yml)
- создай GitHub Release с тегом `vX.Y.Z`, который совпадает с версией в `package.json`
- обычные релизы публикуются в npm с тегом `latest`
- prerelease публикуются в npm с тегом `next`
- в репозитории должен быть secret `NPM_TOKEN` с правом публикации пакета

## Лицензия

<a href="./LICENSE">
  <img src=".github/assets/mit-badge.png" width="70" alt="Лицензия MIT">
</a>

## Авторы

[Ernela](https://github.com/Ernous) — разработчица;  
[D7TUN6](https://github.com/D7TUN6) — идея, разработчик
