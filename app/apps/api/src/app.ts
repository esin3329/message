import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { errorBody, ApiError } from "./lib/errors.js";
import auth from "./routes/auth.js";
import { developmentOrigin } from "./lib/constants.js";
import rooms from "./routes/rooms.js";

const routes = new Hono()
  .use(
    "*",
    cors({
      origin: developmentOrigin,
      credentials: true,
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .use("*", secureHeaders({ crossOriginResourcePolicy: "cross-origin" }))
  .route("/api/auth", auth)
  .route("/api/rooms", rooms)
  .get("/api/health", (c) => c.json({ status: "ok" }));

routes.notFound((c) =>
  c.json(errorBody("NOT_FOUND", "요청한 경로를 찾을 수 없습니다"), 404),
);

routes.onError((error, c) => {
  if (error instanceof ApiError)
    return c.json(errorBody(error.code, error.message), error.status);
  if (
    error instanceof HTTPException &&
    error.status >= 400 &&
    error.status < 500
  ) {
    return c.json(
      errorBody("INVALID_INPUT", "요청 형식이 올바르지 않습니다"),
      error.status,
    );
  }
  console.error("Unhandled request error", error);
  return c.json(errorBody("INTERNAL_ERROR", "서버 오류가 발생했습니다"), 500);
});

export type AppType = typeof routes;
export default routes;
