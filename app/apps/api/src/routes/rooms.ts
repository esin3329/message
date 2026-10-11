import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getRealtimeServer } from "../lib/realtime.js";
import { ApiError, errorBody } from "../lib/errors.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import {
  createRoom,
  joinRoom,
  listRoomMessages,
  listRooms,
} from "../services/room.service.js";

const roomNameSchema = z.object({ name: z.string().trim().min(1).max(80) });
const paramsSchema = z.object({ id: z.string().min(1).max(64) });
const cursorSchema = z.object({ cursor: z.string().min(1).max(64).optional() });
const roomParams = zValidator("param", paramsSchema, (result, c) => {
  if (!result.success)
    return c.json(
      errorBody("INVALID_INPUT", "대화방 식별자가 올바르지 않습니다"),
      400,
    );
});
const roomName = zValidator("json", roomNameSchema, (result, c) => {
  if (!result.success)
    return c.json(
      errorBody("INVALID_INPUT", "방 이름은 1자 이상 80자 이하여야 합니다"),
      400,
    );
});
const messageCursor = zValidator("query", cursorSchema, (result, c) => {
  if (!result.success)
    return c.json(
      errorBody("INVALID_INPUT", "메시지 커서가 올바르지 않습니다"),
      400,
    );
});

const rooms = new Hono<{ Variables: AuthVariables }>()
  .use("*", requireAuth)
  .get("/", async (c) => c.json(await listRooms(c.get("userId"))))
  .post("/", roomName, async (c) => {
    const userId = c.get("userId");
    const room = await createRoom(userId, c.req.valid("json").name.trim());
    getRealtimeServer()
      ?.in(`user:${userId}`)
      .socketsJoin(`conversation:${room.id}`);
    return c.json(room, 201);
  })
  .post("/:id/members/me", roomParams, async (c) => {
    const membership = await joinRoom(c.get("userId"), c.req.valid("param").id);
    getRealtimeServer()
      ?.in(`user:${c.get("userId")}`)
      .socketsJoin(`conversation:${membership.roomId}`);
    return c.json(membership, 201);
  })
  .get("/:id/messages", roomParams, messageCursor, async (c) => {
    try {
      return c.json(
        await listRoomMessages(
          c.get("userId"),
          c.req.valid("param").id,
          c.req.valid("query").cursor,
        ),
      );
    } catch (error) {
      if (error instanceof ApiError)
        return c.json(errorBody(error.code, error.message), error.status);
      throw error;
    }
  });

export default rooms;
