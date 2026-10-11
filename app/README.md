# 모아

브라우저에서 계정을 만들고, 공개 대화방에 들어가, 같은 방의 다른 사람과 메시지를 주고받는 웹앱이다. 메시지는 서버에 저장된 뒤 방에 실시간으로 전달된다.

## 할 수 있는 일

- 가입과 로그인. 액세스 토큰은 메모리에 두고, 새로고침 이후의 세션은 HttpOnly 쿠키로 유지한다.
- 공개 방 목록을 보고 방을 만들거나 참여한다. 방을 만든 사람은 그 방의 멤버가 된다.
- 참여한 방에서 메시지를 보낸다. 상대의 메시지는 새로고침 없이 도착한다.
- 긴 대화는 위로 스크롤하면 과거 이력을 이어서 불러온다.

라우트와 소켓 이벤트 형식은 [`apps/api/api-spec.md`](apps/api/api-spec.md)에 있다.

## 구성

| 위치 | 역할 | 주소 |
| --- | --- | --- |
| `apps/web` | React, Vite | http://localhost:5173 |
| `apps/api` | Hono, Prisma, SQLite, Socket.IO | http://localhost:3000 |

개발 중에는 두 주소 모두 `localhost`를 쓴다. `127.0.0.1`과 섞으면 쿠키 저장소가 갈라진다. API 상태는 http://localhost:3000/api/health 에서 확인한다.

## 필요한 것

- Node.js `24.18.0`. 허용 범위는 `>=24.7.0 <25`이며 `.node-version`에 고정되어 있다.
- pnpm `10.18.1`. 아래 명령은 `corepack pnpm`으로 실행한다.

아래 명령은 모두 이 디렉터리(`app/`)에서 실행한다.

## 처음 실행

### 1. 의존성 설치

```powershell
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
| `DATABASE_URL` | `apps/api/dev.db`를 가리키는 절대 `file:` URL. 이 체크아웃은 `file:C:/project/message/app/apps/api/dev.db` |
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

터미널을 나눠 API와 웹을 각각 켠다.

```powershell
corepack pnpm --filter @repo/api dev
```

```powershell
corepack pnpm --filter @repo/web dev
```

한 번에 켜려면 `corepack pnpm dev`를 쓴다. 브라우저에서 http://localhost:5173 을 연다.

컴파일된 API를 쓰려면 빌드한 다음 시작한다.

```powershell
corepack pnpm --filter @repo/api build
corepack pnpm --filter @repo/api start
```

## 자주 쓰는 명령

| 목적 | 명령 |
| --- | --- |
| API와 웹을 함께 실행 | `corepack pnpm dev` |
| 웹과 API를 빌드 | `corepack pnpm build` |
| 테스트 | `corepack pnpm test` |
| 린트 | `corepack pnpm lint` |
| 포맷 검사 | `corepack pnpm format:check` |
| 시드만 다시 실행 | `corepack pnpm --filter @repo/api db:seed` |

## 두 브라우저로 확인

Chrome 프로필을 나눠 http://localhost:5173 을 각각 연다. 같은 프로필의 탭 두 개는 쿠키를 공유해서 두 사용자로 쓸 수 없다.

1. A에서 `demo-alice`로 로그인하고 공개 방을 만든다.
2. B에서 `demo-bob`로 로그인하고 그 방의 **참여하기**를 누른다.
3. B가 메시지를 보낸다. 저장된 메시지가 B의 목록에 보이고, A에도 바로 도착해야 한다.
4. A를 새로고침한다. 로그인이 유지되고, 방에 다시 연결되며, B의 메시지가 이력에 남아 있어야 한다.
5. 그 방에 가입하지 않은 계정으로 이력을 요청하면 `403 ROOM_FORBIDDEN`이다. 소켓 `message:send`도 같은 코드로 거절된다. 가입은 `POST /api/rooms/:id/members/me`만 처리한다.
6. 로그인한 뒤 `POST /api/auth/refresh`를 한 번 호출하면 새 액세스 토큰과 교체된 refresh 쿠키가 온다. 방금 사용한 refresh 쿠키를 다시 보내면 `401 INVALID_SESSION`이다. 교체된 쿠키도 그 세션 계열이 폐기된 뒤 `401`이어야 한다.
7. 로그아웃 응답은 `204`이고, 그 브라우저의 인증 소켓은 닫힌다. 만료되었거나 위조된 Bearer와 소켓 핸드셰이크는 거절된다.
8. 메시지가 많은 방에서 위로 스크롤하면 과거 이력이 앞에 붙는다. 읽는 중에 새 메시지가 와도 현재 스크롤 위치는 유지된다. 목록은 가장 최신 메시지에서 시작하고, 화면 밖 알림은 새 메시지 한 건만 읽는다.

## Lighthouse

검사 대상은 `/login`, `/rooms`, `/rooms/lhci-demo-room`이다. 모바일 390×844, RTT 150ms, 처리량 1638Kbps, CPU 4배 지연으로 측정한다. 성능과 접근성 점수는 각각 `0.9` 이상이어야 한다. 보고서 JSON과 HTML은 `../.research/lhci`에 저장된다.

1. `corepack pnpm build`와 `corepack pnpm --filter @repo/api db:seed`를 실행한다.
2. API를 http://localhost:3000 에 켜 둔다. 5173 포트를 쓰는 웹 개발 서버는 끈다.
3. `corepack pnpm lhci`를 실행한다. Lighthouse가 웹 프로덕션 프리뷰를 5173에서 띄우고, 고정된 Puppeteer Chromium을 사용한다.

프로덕션 빌드(`dist/.vite/manifest.json`)에서 측정한 초기 JS gzip 크기는 아래와 같다. 초기 JS 합계는 200KB 미만이다.

| 구간 | gzip |
| --- | --- |
| 로그인 경로의 정적 import | 96,654B |
| 목록 경로 | 100,132B |
| 채팅 경로의 동적 모듈까지 | 133,961B |
| 로그인 진입점에서 분리된 Socket.IO 청크 | 12,978B |

웹을 빌드한 뒤 `node scripts/measure-bundle.mjs`로 같은 기준으로 다시 잴 수 있다.
