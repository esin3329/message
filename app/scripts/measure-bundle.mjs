// Vite manifest 기반으로 초기 번들 gzip 크기를 재현 가능하게 측정한다.
// 방법: Node zlib.gzipSync(level 9), 단위 바이트. 실행: node app/scripts/measure-bundle.mjs
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/web/dist",
);
const manifest = JSON.parse(
  readFileSync(join(distDir, ".vite/manifest.json"), "utf8"),
);

const gzipSize = (file) =>
  gzipSync(readFileSync(join(distDir, file)), { level: 9 }).length;
const chunkOf = (key) => manifest[key]?.file;

function staticClosure(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  seen.add(key);
  const chunk = manifest[key];
  for (const imported of chunk?.imports ?? []) staticClosure(imported, seen);
  return seen;
}

const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry);
if (!entryKey) throw new Error("manifest에 엔트리 청크가 없습니다");

const initialKeys = [...staticClosure(entryKey)];
const initialJs = initialKeys
  .map(chunkOf)
  .filter((file) => file?.endsWith(".js"));
const initialCss = [
  ...new Set(initialKeys.flatMap((key) => manifest[key].css ?? [])),
];
const initialFileSet = new Set(initialKeys.map(chunkOf));
const dynamicJs = [
  ...new Set(Object.values(manifest).map((chunk) => chunk.file)),
].filter((file) => file?.endsWith(".js") && !initialFileSet.has(file));

const sum = (files) => files.reduce((total, file) => total + gzipSize(file), 0);

// 경로별 총합: bootstrap 정적 closure에 각 lazy 화면 chunk의 정적 closure를 합산한다.
// 인증 후에만 로드되는 socket chunk는 인증 경로에만 명시적으로 포함한다.
const keyOf = (fragment) => {
  const key = Object.keys(manifest).find(
    (name) => name.includes(fragment) || manifest[name].name === fragment,
  );
  if (!key) throw new Error(`manifest에 ${fragment} 청크가 없습니다`);
  return key;
};
const loginKey = keyOf("src/pages/LoginPage");
const roomListKey = keyOf("src/pages/RoomListPage");
const roomKey = keyOf("src/pages/RoomPage");
const socketKey = keyOf("socket");

function routeGzip(...extraKeys) {
  const keys = new Set(initialKeys);
  for (const extra of extraKeys)
    for (const key of staticClosure(extra)) keys.add(key);
  const js = [...new Set([...keys].map(chunkOf))].filter((file) =>
    file?.endsWith(".js"),
  );
  const css = [...new Set([...keys].flatMap((key) => manifest[key].css ?? []))];
  return {
    js,
    jsGzipTotal: sum(js),
    css,
    cssGzipTotal: sum(css),
  };
}

const report = {
  method: "node:zlib gzipSync level 9 (bytes)",
  entry: { file: chunkOf(entryKey), gzip: gzipSize(chunkOf(entryKey)) },
  initialJs: initialJs.map((file) => ({ file, gzip: gzipSize(file) })),
  initialJsGzipTotal: sum(initialJs),
  initialCss: initialCss.map((file) => ({ file, gzip: gzipSize(file) })),
  initialCssGzipTotal: sum(initialCss),
  dynamicJs: dynamicJs.map((file) => ({ file, gzip: gzipSize(file) })),
  routes: {
    bootstrap: routeGzip(),
    login: routeGzip(loginKey),
    roomList: routeGzip(roomListKey),
    roomListAuthenticated: routeGzip(roomListKey, socketKey),
    room: routeGzip(roomKey, socketKey),
  },
};
console.log(JSON.stringify(report, null, 2));
