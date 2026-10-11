import { createServer } from "node:http";
import { afterAll, describe, expect, it } from "vitest";
import {
  io as createSocketClient,
  type Socket as ClientSocket,
} from "socket.io-client";
import app from "./app.js";
import { prisma } from "./lib/db.js";
import { setRealtimeServer } from "./lib/realtime.js";
import type {
  Ack,
  ChatMessage,
  ClientToServerEvents,
  ServerToClientEvents,
} from "./ws/events.js";
import { attachSocketServer } from "./ws/socket.js";

type IntegrationSocket = ClientSocket<
  ServerToClientEvents,
  ClientToServerEvents
>;
let testRealtime: ReturnType<typeof attachSocketServer> | undefined;
let testOwnerSocket: IntegrationSocket | undefined;
let testMemberSocket: IntegrationSocket | undefined;
let testRoomId: string | undefined;
const runId = `test-${Date.now()}`;
const usernameA = `${runId}-alice`;
const usernameB = `${runId}-bob`;
type LoginResult = {
  accessToken: string;
  cookie: string;
  user: { id: string; username: string };
};

async function requestJson(
  path: string,
  body: unknown,
  accessToken?: string,
): Promise<Response> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return app.request(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function registerAndLogin(username: string): Promise<LoginResult> {
  const password = "Integration-test-2026!";
  const registered = await requestJson("/api/auth/register", {
    username,
    password,
  });
  expect(registered.status).toBe(201);
  const response = await requestJson("/api/auth/login", {
    username: username.toUpperCase(),
    password,
  });
  expect(response.status).toBe(200);
  const data = (await response.json()) as Omit<LoginResult, "cookie">;
  const cookieValue = response.headers
    .get("set-cookie")
    ?.match(/refreshToken=([^;,]+)/)?.[1];
  if (!cookieValue) throw new Error("login did not issue the refresh cookie");
  return { ...data, cookie: `refreshToken=${cookieValue}` };
}

describe("SQLite-backed authentication and room access", () => {
  afterAll(async () => {
    testOwnerSocket?.disconnect();
    testMemberSocket?.disconnect();
    if (testRealtime) {
      const realtime = testRealtime;
      testRealtime = undefined;
      setRealtimeServer(undefined);
      await new Promise<void>((resolve) => realtime.close(() => resolve()));
    }
    if (testRoomId) await prisma.room.deleteMany({ where: { id: testRoomId } });
    await prisma.user.deleteMany({
      where: { username: { startsWith: runId } },
    });
    await prisma.$disconnect();
  });

  it("normalizes unique usernames and restores identity through a rotated session", async () => {
    const alice = await registerAndLogin(usernameA);
    const duplicate = await requestJson("/api/auth/register", {
      username: usernameA.toUpperCase(),
      password: "Integration-test-2026!",
    });
    expect(duplicate.status).toBe(409);

    const firstRotation = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: alice.cookie },
    });
    expect(firstRotation.status).toBe(200);
    const rotated = (await firstRotation.json()) as { accessToken: string };
    const identity = await app.request("/api/auth/me", {
      headers: { Authorization: `Bearer ${rotated.accessToken}` },
    });
    expect(identity.status).toBe(200);
    expect((await identity.json()).user.username).toBe(usernameA);
  });

  it("denies nonmembers history and makes self-join idempotent", async () => {
    const alice = await registerAndLogin(`${runId}-owner`);
    const bob = await registerAndLogin(usernameB);
    const created = await requestJson(
      "/api/rooms",
      { name: "private history test" },
      alice.accessToken,
    );
    expect(created.status).toBe(201);
    const room = (await created.json()) as { id: string };

    const forbidden = await app.request(`/api/rooms/${room.id}/messages`, {
      headers: { Authorization: `Bearer ${bob.accessToken}` },
    });
    expect(forbidden.status).toBe(403);
    const joined = await app.request(`/api/rooms/${room.id}/members/me`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bob.accessToken}` },
    });
    expect(joined.status).toBe(201);
    const duplicateJoin = await app.request(
      `/api/rooms/${room.id}/members/me`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${bob.accessToken}` },
      },
    );
    expect(duplicateJoin.status).toBe(201);
    const allowed = await app.request(`/api/rooms/${room.id}/messages`, {
      headers: { Authorization: `Bearer ${bob.accessToken}` },
    });
    expect(allowed.status).toBe(200);
    const roomsResponse = await app.request("/api/rooms", {
      headers: { Authorization: `Bearer ${bob.accessToken}` },
    });
    const listed = (await roomsResponse.json()) as Array<{
      id: string;
      isMember: boolean;
    }>;
    expect(listed.find((item) => item.id === room.id)?.isMember).toBe(true);
    expect(
      await prisma.roomMember.count({
        where: { roomId: room.id, userId: bob.user.id },
      }),
    ).toBe(1);
  });

  it("rejects old refresh reuse and revokes the entire token family", async () => {
    const account = await registerAndLogin(`${runId}-rotate`);
    const refresh = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: account.cookie },
    });
    const replacementCookie = refresh.headers
      .get("set-cookie")
      ?.match(/refreshToken=([^;,]+)/)?.[1];
    expect(refresh.status).toBe(200);
    if (!replacementCookie)
      throw new Error("refresh did not rotate the cookie");

    const replay = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: account.cookie },
    });
    expect(replay.status).toBe(401);
    const replacementReplay = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: `refreshToken=${replacementCookie}` },
    });
    expect(replacementReplay.status).toBe(401);
    const oldAccess = await app.request("/api/auth/me", {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    expect(oldAccess.status).toBe(401);
  });

  it("rejects malformed JSON with a 400 error body", async () => {
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{broken json",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_INPUT" },
    });
  });

  it("disconnects room sockets when a reused refresh token revokes the family", async () => {
    const owner = await registerAndLogin(`${runId}-revoke-owner`);
    const httpServer = createServer();
    const realtime = attachSocketServer(httpServer);
    setRealtimeServer(realtime);
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, resolve);
    });
    try {
      const address = httpServer.address();
      if (!address || typeof address === "string")
        throw new Error("revocation test server did not bind a TCP port");
      const socket = createSocketClient<
        ServerToClientEvents,
        ClientToServerEvents
      >(`http://127.0.0.1:${address.port}`, {
        auth: { token: owner.accessToken },
        reconnection: false,
        transports: ["websocket"],
      });
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });

      const refresh = await app.request("/api/auth/refresh", {
        method: "POST",
        headers: { Cookie: owner.cookie },
      });
      expect(refresh.status).toBe(200);
      const replay = await app.request("/api/auth/refresh", {
        method: "POST",
        headers: { Cookie: owner.cookie },
      });
      expect(replay.status).toBe(401);
      await new Promise<void>((resolve) => {
        if (socket.disconnected) return resolve();
        socket.once("disconnect", () => resolve());
        setTimeout(resolve, 3000);
      });
      expect(socket.connected).toBe(false);

      const accessAfterRevoke = await app.request("/api/auth/me", {
        headers: { Authorization: `Bearer ${owner.accessToken}` },
      });
      expect(accessAfterRevoke.status).toBe(401);
    } finally {
      setRealtimeServer(testRealtime);
      await new Promise<void>((resolve) => realtime.close(() => resolve()));
    }
  }, 15000);

  it("logout revokes the session family and disconnects its sockets", async () => {
    const account = await registerAndLogin(`${runId}-logout`);
    const created = await requestJson(
      "/api/rooms",
      { name: "logout room" },
      account.accessToken,
    );
    expect(created.status).toBe(201);
    const room = (await created.json()) as { id: string };

    const httpServer = createServer();
    const realtime = attachSocketServer(httpServer);
    setRealtimeServer(realtime);
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, resolve);
    });
    try {
      const address = httpServer.address();
      if (!address || typeof address === "string")
        throw new Error("logout test server did not bind a TCP port");
      const socket = createSocketClient<
        ServerToClientEvents,
        ClientToServerEvents
      >(`http://127.0.0.1:${address.port}`, {
        auth: { token: account.accessToken },
        reconnection: false,
        transports: ["websocket"],
      });
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });

      const logout = await app.request("/api/auth/logout", {
        method: "POST",
        headers: { Cookie: account.cookie },
      });
      expect(logout.status).toBe(204);
      await new Promise<void>((resolve) => {
        if (socket.disconnected) return resolve();
        socket.once("disconnect", () => resolve());
        setTimeout(resolve, 3000);
      });
      expect(socket.connected).toBe(false);

      const meAfter = await app.request("/api/auth/me", {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      });
      expect(meAfter.status).toBe(401);
      const refreshAfter = await app.request("/api/auth/refresh", {
        method: "POST",
        headers: { Cookie: account.cookie },
      });
      expect(refreshAfter.status).toBe(401);
      const stored = await prisma.message.count({
        where: { roomId: room.id },
      });
      expect(stored).toBe(0);
      socket.disconnect();
    } finally {
      setRealtimeServer(testRealtime);
      await new Promise<void>((resolve) => realtime.close(() => resolve()));
      await prisma.room.delete({ where: { id: room.id } });
    }
  }, 15000);

  it("ignores message:send without an ack callback instead of crashing", async () => {
    const member = await registerAndLogin(`${runId}-noack-member`);
    const owner = await registerAndLogin(`${runId}-noack-owner`);
    const created = await requestJson(
      "/api/rooms",
      { name: "no-ack room" },
      owner.accessToken,
    );
    expect(created.status).toBe(201);
    const room = (await created.json()) as { id: string };
    const joined = await app.request(`/api/rooms/${room.id}/members/me`, {
      method: "POST",
      headers: { Authorization: `Bearer ${member.accessToken}` },
    });
    expect(joined.status).toBe(201);

    const httpServer = createServer();
    const realtime = attachSocketServer(httpServer);
    setRealtimeServer(realtime);
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, resolve);
    });
    try {
      const address = httpServer.address();
      if (!address || typeof address === "string")
        throw new Error("no-ack test server did not bind a TCP port");
      const socket = createSocketClient<
        ServerToClientEvents,
        ClientToServerEvents
      >(`http://127.0.0.1:${address.port}`, {
        auth: { token: member.accessToken },
        reconnection: false,
        transports: ["websocket"],
      });
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });

      socket.emit("message:send", {
        roomId: room.id,
        text: "no acknowledgement requested",
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      expect(socket.connected).toBe(true);

      const history = await app.request(`/api/rooms/${room.id}/messages`, {
        headers: { Authorization: `Bearer ${owner.accessToken}` },
      });
      expect(history.status).toBe(200);
      const historyPayload = (await history.json()) as {
        messages: Array<{ text: string }>;
      };
      expect(
        historyPayload.messages.some(
          (message) => message.text === "no acknowledgement requested",
        ),
      ).toBe(false);

      const stillWorks = new Promise<Ack<ChatMessage>>((resolve) => {
        socket.emit(
          "message:send",
          { roomId: room.id, text: "acknowledged send after the probe" },
          resolve,
        );
      });
      expect(await stillWorks).toMatchObject({
        text: "acknowledged send after the probe",
      });
      socket.disconnect();
    } finally {
      setRealtimeServer(testRealtime);
      await new Promise<void>((resolve) => realtime.close(() => resolve()));
      await prisma.room.delete({ where: { id: room.id } });
    }
  }, 15000);

  it("delivers messages to an already-connected room creator", async () => {
    const owner = await registerAndLogin(`${runId}-socket-owner`);
    const member = await registerAndLogin(`${runId}-socket-member`);
    const httpServer = createServer();
    testRealtime = attachSocketServer(httpServer);
    setRealtimeServer(testRealtime);
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, resolve);
    });
    const address = httpServer.address();
    if (!address || typeof address === "string")
      throw new Error("socket test server did not bind a TCP port");
    const connect = async (accessToken: string): Promise<IntegrationSocket> => {
      const socket = createSocketClient<
        ServerToClientEvents,
        ClientToServerEvents
      >(`http://127.0.0.1:${address.port}`, {
        auth: { token: accessToken },
        reconnection: false,
        transports: ["websocket"],
      });
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      return socket;
    };
    testOwnerSocket = await connect(owner.accessToken);
    const created = await requestJson(
      "/api/rooms",
      { name: "socket creator room" },
      owner.accessToken,
    );
    expect(created.status).toBe(201);
    const room = (await created.json()) as { id: string };
    testRoomId = room.id;
    testMemberSocket = await connect(member.accessToken);
    const joined = await app.request(`/api/rooms/${room.id}/members/me`, {
      method: "POST",
      headers: { Authorization: `Bearer ${member.accessToken}` },
    });
    expect(joined.status).toBe(201);

    const text = "message after room creation";
    const delivered = new Promise<ChatMessage>((resolve) => {
      testOwnerSocket!.once("message:new", resolve);
    });
    const acknowledgement = new Promise<Ack<ChatMessage>>((resolve) => {
      testMemberSocket!.emit(
        "message:send",
        { roomId: room.id, text },
        resolve,
      );
    });
    expect(await acknowledgement).toMatchObject({
      roomId: room.id,
      text,
      sender: { username: member.user.username },
    });
    expect(await delivered).toMatchObject({
      roomId: room.id,
      text,
      sender: { username: member.user.username },
    });
  }, 15000);
});
