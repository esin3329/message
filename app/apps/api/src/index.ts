import "dotenv/config";
import { serve } from "@hono/node-server";
import type { Server as HttpServer } from "node:http";
import app from "./app.js";
import { setRealtimeServer } from "./lib/realtime.js";
import { attachSocketServer } from "./ws/socket.js";

const port = Number(process.env.PORT ?? 3000);
const httpServer = serve({ fetch: app.fetch, port });
setRealtimeServer(attachSocketServer(httpServer as unknown as HttpServer));
console.info(`API listening on http://localhost:${port}`);
