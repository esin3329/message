import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { isFamilyRevoked, verifyAccessToken } from "../lib/session.js";
import { developmentOrigin } from "../lib/constants.js";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./events.js";

const sendSchema = z.object({
  roomId: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(4000),
});
const accessPayloadSchema = z.object({ exp: z.number() });
const sessionSelect = {
  userId: true,
  familyId: true,
  expiresAt: true,
  revokedAt: true,
} as const;

// Thrown inside the send transaction when revocation lands between the pre-check and the write,
// so the message row is rolled back instead of being persisted by a dead session.
class SessionRevokedError extends Error {}

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
export type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export function attachSocketServer(server: HttpServer): RealtimeServer {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(server, {
    cors: { origin: developmentOrigin, credentials: true },
  });
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (typeof token !== "string") throw new Error("Missing token");
      const claims = await verifyAccessToken(token);
      const session = await prisma.session.findUnique({
        where: { id: claims.sessionId },
        select: sessionSelect,
      });
      if (
        !session ||
        session.userId !== claims.userId ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      )
        throw new Error("Invalid session");
      const payload = accessPayloadSchema.parse(
        JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()),
      );
      if (payload.exp * 1000 <= Date.now())
        throw new Error("Expired access token");
      socket.data = {
        userId: claims.userId,
        sessionId: claims.sessionId,
        familyId: session.familyId,
        expiresAt: payload.exp * 1000,
        validated: false,
      };
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    // Register the send handler immediately so client emissions during async setup are not lost (N06).
    socket.on("message:send", (payload, ack) => {
      void handleSend(socket, payload, ack);
    });
    const expiryTimer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, socket.data.expiresAt - Date.now()),
    );
    expiryTimer.unref();
    socket.on("disconnect", () => clearTimeout(expiryTimer));
    void setupConnection(socket);
  });

  // Re-validates the session after the handshake, then joins rooms only after validation passes.
  // A socket that fails validation is disconnected before it can receive any broadcast (F01).
  async function setupConnection(socket: RealtimeSocket): Promise<void> {
    try {
      const session = await prisma.session.findUnique({
        where: { id: socket.data.sessionId },
        select: sessionSelect,
      });
      if (
        !session ||
        session.userId !== socket.data.userId ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        Date.now() >= socket.data.expiresAt
      ) {
        socket.disconnect(true);
        return;
      }
      const memberships = await prisma.roomMember.findMany({
        where: { userId: socket.data.userId },
        select: { roomId: true },
      });
      // Final check immediately before the first join: revocation or access expiry that landed
      // during the membership query must not leave the socket in any room (F01, N05).
      const finalCheck = await prisma.session.findUnique({
        where: { id: socket.data.sessionId },
        select: { revokedAt: true, expiresAt: true },
      });
      if (
        !finalCheck ||
        finalCheck.revokedAt ||
        finalCheck.expiresAt <= new Date() ||
        Date.now() >= socket.data.expiresAt
      ) {
        socket.disconnect(true);
        return;
      }
      socket.join(`user:${socket.data.userId}`);
      socket.join(`session:${socket.data.familyId}`);
      for (const membership of memberships)
        await socket.join(`conversation:${membership.roomId}`);
      // A revocation that landed between the final read and the join must still be caught.
      const postJoin = await prisma.session.findUnique({
        where: { id: socket.data.sessionId },
        select: { revokedAt: true, expiresAt: true },
      });
      if (
        !postJoin ||
        postJoin.revokedAt ||
        postJoin.expiresAt <= new Date() ||
        Date.now() >= socket.data.expiresAt
      ) {
        socket.disconnect(true);
        return;
      }
      socket.data.validated = true;
    } catch {
      socket.disconnect(true);
    }
  }

  async function handleSend(
    socket: RealtimeSocket,
    payload: unknown,
    ack: unknown,
  ): Promise<void> {
    if (typeof ack !== "function") return;
    try {
      const parsed = sendSchema.safeParse(payload);
      if (!parsed.success) {
        ack({
          error: {
            code: "INVALID_INPUT",
            message: "메시지는 1자 이상 4000자 이하여야 합니다",
          },
        });
        return;
      }
      // Reject sends until setup completed; the client queues and retries on reconnect.
      if (!socket.data.validated) {
        ack({
          error: {
            code: "SESSION_SETUP_PENDING",
            message: "연결 준비 중입니다. 잠시 후 다시 시도해 주세요",
          },
        });
        return;
      }
      // Access-token expiry is enforced at send time, not only via the disconnect timer (N05).
      if (Date.now() >= socket.data.expiresAt) {
        ack({
          error: {
            code: "INVALID_SESSION",
            message: "세션이 만료되었습니다",
          },
        });
        socket.disconnect(true);
        return;
      }
      const session = await prisma.session.findUnique({
        where: { id: socket.data.sessionId },
        select: { revokedAt: true, expiresAt: true },
      });
      if (!session || session.revokedAt || session.expiresAt <= new Date()) {
        ack({
          error: {
            code: "INVALID_SESSION",
            message: "세션이 만료되었습니다",
          },
        });
        socket.disconnect(true);
        return;
      }
      const membership = await prisma.roomMember.findUnique({
        where: {
          roomId_userId: {
            roomId: parsed.data.roomId,
            userId: socket.data.userId,
          },
        },
        select: { roomId: true },
      });
      if (!membership) {
        ack({
          error: {
            code: "ROOM_FORBIDDEN",
            message: "대화방 참여자만 메시지를 보낼 수 있습니다",
          },
        });
        return;
      }
      // The session is re-validated inside the write transaction, so a revocation that
      // lands after the pre-check rolls the row back instead of persisting a dead session's message.
      const message = await prisma.$transaction(async (tx) => {
        const fresh = await tx.session.findUnique({
          where: { id: socket.data.sessionId },
          select: { revokedAt: true, expiresAt: true },
        });
        if (!fresh || fresh.revokedAt || fresh.expiresAt <= new Date())
          throw new SessionRevokedError();
        return tx.message.create({
          data: {
            roomId: membership.roomId,
            senderId: socket.data.userId,
            text: parsed.data.text,
          },
          include: { sender: { select: { id: true, username: true } } },
        });
      });
      const result = {
        ...message,
        createdAt: message.createdAt.toISOString(),
      };
      // Filter recipients at broadcast time so a socket that joined with a stale validation
      // result (or was revoked after joining) does not receive the message (F01).
      // Two layers share one boundary here: the batch DB snapshot below filters sessions
      // revoked before the read, and the in-process revocation registry — marked synchronously
      // before the revoking write commits — is consulted in the same synchronous emit loop,
      // so a revocation decided after the snapshot was taken is still honored (F01).
      const targets = await io
        .in(`conversation:${membership.roomId}`)
        .fetchSockets();
      const now = Date.now();
      const candidates = targets.filter(
        (target) => target.data.validated && now < target.data.expiresAt,
      );
      const sessionIds = candidates.map((target) => target.data.sessionId);
      const sessions = await prisma.session.findMany({
        where: { id: { in: sessionIds } },
        select: { id: true, revokedAt: true, expiresAt: true },
      });
      const validSessions = new Map(
        sessions
          .filter(
            (session) => !session.revokedAt && session.expiresAt > new Date(),
          )
          .map((session) => [session.id, session]),
      );
      for (const target of candidates) {
        if (
          !validSessions.has(target.data.sessionId) ||
          isFamilyRevoked(target.data.familyId)
        ) {
          target.disconnect(true);
          continue;
        }
        target.emit("message:new", result);
      }
      ack(result);
    } catch (error) {
      if (error instanceof SessionRevokedError) {
        ack({
          error: {
            code: "INVALID_SESSION",
            message: "세션이 만료되었습니다",
          },
        });
        socket.disconnect(true);
        return;
      }
      ack({
        error: {
          code: "INTERNAL_ERROR",
          message: "메시지를 전송하지 못했습니다",
        },
      });
    }
  }
  return io;
}
