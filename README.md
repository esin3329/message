# 모아

가입하고, 공개 대화방에 들어가, 같은 방의 다른 사람과 메시지를 주고받는 웹앱이다. 메시지는 서버에 저장된 뒤 방에 실시간으로 전달된다.

할 수 있는 일은 다음과 같다.

- 가입과 로그인. 액세스 토큰은 메모리에 두고, 새로고침 이후의 세션은 HttpOnly 쿠키로 유지한다.
- 공개 방 목록을 보고 방을 만들거나 참여한다. 방을 만든 사람은 그 방의 멤버가 된다.
- 참여한 방에서 메시지를 보낸다. 상대의 메시지는 새로고침 없이 도착한다.
- 긴 대화는 위로 스크롤하면 과거 이력을 이어서 불러온다.

## 저장소 구성

소스와 실행 명령은 [`app/`](app/)에 있다. 아래 설치 순서는 그 디렉터리에서 실행한다.

| 위치 | 역할 | 주소 |
| --- | --- | --- |
| [`app/apps/web`](app/apps/web) | React, Vite | http://localhost:5173 |
| [`app/apps/api`](app/apps/api) | Hono, Prisma, SQLite, Socket.IO | http://localhost:3000 |

개발 중에는 두 주소 모두 `localhost`를 쓴다. `127.0.0.1`과 섞으면 쿠키 저장소가 갈라진다.

API 형식은 [`app/apps/api/api-spec.md`](app/apps/api/api-spec.md)에 있다. 두 브라우저 확인, Lighthouse, 번들 크기, 명령 표는 [`app/README.md`](app/README.md)에 있다.

## 필요한 것

- Node.js `24.18.0`. 허용 범위는 `>=24.7.0 <25`이며 [`app/.node-version`](app/.node-version)에 고정되어 있다.
- pnpm `10.18.1`. 명령은 `corepack pnpm`으로 실행한다.

## 처음 실행

`app`으로 이동한 뒤 순서대로 실행한다.

### 1. 의존성 설치

```powershell
cd app
corepack pnpm install
```

`better-sqlite3` 네이티브 빌드가 막히면, pnpm이 보여주는 승인 목록에서 `@prisma/engines`, `better-sqlite3`, `esbuild`, `prisma`만 허용한 뒤 같은 설치 명령을 다시 실행한다.

### 2. 환경 파일

PowerShell:

```powershell
Copy-Item apps\api\.env.example apps\api\.env
```

그 밖의 셸:

```bash
cp apps/api/.env.example apps/api/.env
```

`apps/api/.env`에서 두 값만 맞춘다.

| 변수 | 설정 |
| --- | --- |
| `DATABASE_URL` | `app/apps/api/dev.db`를 가리키는 절대 `file:` URL. 예: `file:C:/project/message/app/apps/api/dev.db` |
| `JWT_SECRET` | 32바이트 이상의 난수. 예제 문구를 그대로 두지 않는다. |

`JWT_ISSUER`는 `message-api`, `JWT_AUDIENCE`는 `message-web`, `PORT`는 `3000`이다. Prisma와 API 런타임은 같은 `DATABASE_URL`을 읽는다.

### 3. 데이터베이스

```powershell
corepack pnpm --filter @repo/api db:migrate
corepack pnpm --filter @repo/api db:generate
corepack pnpm --filter @repo/api db:seed
```

시드는 데모 계정 둘, 방 `lhci-demo-room`, 시각이 고정된 메시지 30건을 넣는다. 다시 실행해도 같은 데이터를 유지한다.

| 아이디 | 비밀번호 |
| --- | --- |
| `demo-alice` | `Alice-chat-2026!` |
| `demo-bob` | `Bob-chat-2026!` |

이 계정은 로컬 시드 전용이다.

### 4. 서버

```powershell
corepack pnpm dev
```

브라우저에서 http://localhost:5173 을 연다. API 상태는 http://localhost:3000/api/health 에서 확인한다.

API와 웹을 나눠 켜려면 [`app/README.md`](app/README.md)의 서버 절을 따른다.
