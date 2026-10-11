# API contract

Base URL: `http://localhost:3000`; JSON errors use `{ "error": { "code", "message" } }`. Authenticated REST requests use `Authorization: Bearer <access JWT>`.

| Method and path                           | Body/query               | Result                                                       |
| ----------------------------------------- | ------------------------ | ------------------------------------------------------------ |
| `POST /api/auth/register`                 | `{ username, password }` | `201 { user }`; normalized username; duplicate `409`         |
| `POST /api/auth/login`                    | `{ username, password }` | `200 { accessToken, user }`; refresh cookie is HttpOnly only |
| `POST /api/auth/refresh`                  | refresh cookie           | rotates one-time refresh session; `200 { accessToken }`      |
| `POST /api/auth/logout`                   | refresh cookie           | revokes session and closes its sockets; `204`                |
| `GET /api/auth/me`                        | Bearer access JWT        | `200 { user }`                                               |
| `GET /api/rooms`                          | Bearer                   | public room metadata including current-user membership       |
| `POST /api/rooms`                         | `{ name }`; Bearer       | `201 room`; creator joins atomically                         |
| `POST /api/rooms/:id/members/me`          | Bearer                   | idempotent self-join, `201 { roomId, userId }`               |
| `GET /api/rooms/:id/messages?cursor=<id>` | Bearer                   | joined users only; 30 newest-first messages and `nextCursor` |

Socket.IO handshake uses `auth: { token }`; joined rooms are server-owned `conversation:<roomId>`. `message:send` accepts `{ roomId, text }`, persists before `message:new`, and acks the stored message or `{ error }`.

Input limits: username 3–32 ASCII letters/digits/underscore/hyphen; password 12–128 chars; room name 1–80 chars; message 1–4000 chars.
