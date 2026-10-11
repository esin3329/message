# 모아 메시징 앱

## 개발 환경

- Node.js `24.18.0` (`.node-version`; 허용 범위 `>=24.7.0 <25`)
- pnpm `10.18.1` (`packageManager`)
- Windows PowerShell에서도 corepack 실행 파일을 사용한다.

```powershell
cd C:\project\message\app
corepack pnpm install
Copy-Item apps\api\.env.example apps\api\.env
```

`apps/api/.env`의 `JWT_SECRET`을 최소 32바이트 난수로 바꾸고, `DATABASE_URL`을 API 디렉터리의 `dev.db`를 가리키는 절대 `file:` URL로 둔다. 현재 checkout 기본값은 `file:C:/project/message/app/apps/api/dev.db`다. Prisma config는 이 값을 config 파일 위치 기준 경로와 비교하고, 런타임 adapter는 같은 `DATABASE_URL`을 사용한다.

```powershell
corepack pnpm --filter @repo/api exec prisma migrate dev --name init
corepack pnpm --filter @repo/api exec prisma generate
corepack pnpm --filter @repo/api exec prisma db seed
```

`better-sqlite3` 네이티브 설치가 차단되면 pnpm이 표시하는 승인 안내에 `@prisma/engines`, `better-sqlite3`, `esbuild`, `prisma`만 승인한 뒤 `corepack pnpm install`을 다시 실행한다. Prisma CLI는 API workspace에서 `pnpm exec prisma`로 실행한다.

## 실행

API와 SPA를 각 PowerShell 창에서 실행한다.

```powershell
cd C:\project\message\app
corepack pnpm --filter @repo/api dev
```

컴파일된 API를 실행하려면 먼저 빌드한 다음 `start`를 사용한다.

```powershell
corepack pnpm --filter @repo/api build
corepack pnpm --filter @repo/api start
```

```powershell
cd C:\project\message\app
corepack pnpm --filter @repo/web dev
```

- API: `http://localhost:3000`
- Web: `http://localhost:5173`
- health check: `http://localhost:3000/api/health`
- 개발 호스트는 두 서비스 모두 `localhost`로 유지한다 (`127.0.0.1` 혼용 금지).
- seeded accounts: `demo-alice` / `Alice-chat-2026!`; `demo-bob` / `Bob-chat-2026!`.

검사:

```powershell
corepack pnpm --filter @repo/api build
corepack pnpm --filter @repo/web build
corepack pnpm --filter @repo/api test
corepack pnpm --filter @repo/web test
```

## 실제 두 브라우저 acceptance 절차

Chrome의 서로 다른 프로필(쿠키 저장소 분리)을 사용해 `http://localhost:5173`을 각각 연다. 독립 사용자 상태가 필요하므로 같은 프로필의 탭 두 개를 두 브라우저 대신 쓰지 않는다.

1. 브라우저 A에서 `demo-alice`로 로그인한다. 공개 대화방 목록에서 새 그룹방을 만든다.
2. 브라우저 B에서 `demo-bob`로 로그인한다. A가 만든 방의 `참여하기`를 누른다.
3. B가 메시지를 전송한다. 저장된 메시지가 송신자 목록에 나타나고 A에도 실시간으로 도착하는지 확인한다.
4. 브라우저 A를 새로고침한다. refresh 쿠키로 로그인이 복원되고, 방에 다시 연결되며, 이력에서 B의 메시지가 보이는지 확인한다.
5. 비회원 계정으로 같은 방에 접근한다. 메시지 이력 HTTP 응답은 `403 ROOM_FORBIDDEN`; 소켓 `message:send` ack도 `ROOM_FORBIDDEN`이어야 한다. 비회원 join 이벤트는 존재하지 않으며 가입은 `POST /api/rooms/:id/members/me`로만 처리한다.
6. 인증 세션을 새로 로그인하고 `POST /api/auth/refresh`를 한 번 호출한다. 응답은 새 access token과 교체 refresh 쿠키를 반환한다. 같은 이전 refresh 쿠키를 다시 보내면 `401 INVALID_SESSION`이고, 교체 쿠키도 가족 세션 폐기 후 `401`이어야 한다.
7. 정상 세션에서 로그아웃한다. 응답은 `204`, 같은 브라우저의 인증 소켓은 닫힌다. 만료/위조 Bearer와 Socket.IO 핸드셰이크는 거부된다.
8. 대화가 쌓인 방에서 과거 이력을 prepend하고, 읽는 중 새 메시지를 받아도 현재 스크롤 위치가 유지되는지 확인한다. 목록은 가장 최신 메시지로 시작하고 가상 목록 밖 live region은 새 메시지 한 건만 알린다.

API OpenAPI 대신 라우트·이벤트 형식은 [`apps/api/api-spec.md`](apps/api/api-spec.md)에 정리했다.

## Lighthouse CI

Lighthouse config audits `/login`, `/rooms`, and `/rooms/lhci-demo-room` using a fixed 390×844 mobile viewport, 150 ms RTT, 1638 Kbps throughput, and 4× CPU slowdown. The idempotent seed creates the demo room and 30 fixed-timestamp messages. Performance and accessibility must each score at least `0.9`; JSON/HTML reports are written to `../.research/lhci`.

1. Run `corepack pnpm build` and `corepack pnpm --filter @repo/api db:seed`.
2. Keep the API running at `http://localhost:3000`; stop the web dev server occupying port `5173`.
3. From `app/`, run `corepack pnpm lhci`. LHCI starts the production Vite preview at port `5173` and uses its pinned Puppeteer Chromium.

최종 빌드(`dist/.vite/manifest.json`) 기준 로그인 경로 초기 JS 정적 import 합계는 `96,654B gzip`이고, 목록 경로는 `100,132B`, 채팅 경로 동적 모듈까지는 `133,961B`다. Socket.IO 청크는 로그인 진입점에서 분리되며 `12,978B gzip`이다. 초기 JS 합계는 `200KB` 예산 미만이다.
