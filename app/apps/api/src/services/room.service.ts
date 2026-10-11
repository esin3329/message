import { prisma } from "../lib/db.js";
import { Prisma } from "../generated/prisma/client.js";
import { ApiError } from "../lib/errors.js";

export type RoomSummary = {
  id: string;
  name: string;
  createdAt: Date;
  isMember: boolean;
  _count: { members: number };
};
export type CreatedRoom = { id: string; name: string; createdAt: Date };
export type JoinResult = { roomId: string; userId: string };
export type RoomMessage = Prisma.MessageGetPayload<{
  include: { sender: { select: { id: true; username: true } } };
}>;
export type MessagePage = {
  messages: RoomMessage[];
  nextCursor: string | null;
};

export async function listRooms(userId: string): Promise<RoomSummary[]> {
  const rooms = await prisma.room.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { members: true } },
      members: { where: { userId }, select: { userId: true } },
    },
  });
  return rooms.map(({ members, ...room }) => ({
    ...room,
    isMember: members.length > 0,
  }));
}

export async function createRoom(
  userId: string,
  name: string,
): Promise<CreatedRoom> {
  return prisma.room.create({
    data: { name, members: { create: { userId } } },
    select: { id: true, name: true, createdAt: true },
  });
}

export async function joinRoom(
  userId: string,
  roomId: string,
): Promise<JoinResult> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true },
  });
  if (!room)
    throw new ApiError(404, "ROOM_NOT_FOUND", "대화방을 찾을 수 없습니다");
  await prisma.roomMember.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: { roomId, userId },
    update: {},
  });
  return { roomId, userId };
}

export async function listRoomMessages(
  userId: string,
  roomId: string,
  cursor?: string,
): Promise<MessagePage> {
  const membership = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!membership) {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true },
    });
    if (!room)
      throw new ApiError(404, "ROOM_NOT_FOUND", "대화방을 찾을 수 없습니다");
    throw new ApiError(
      403,
      "ROOM_FORBIDDEN",
      "대화방 참여자만 메시지를 볼 수 있습니다",
    );
  }
  const anchor = cursor
    ? await prisma.message.findUnique({
        where: { id: cursor },
        select: { id: true, roomId: true, createdAt: true },
      })
    : null;
  if (cursor && (!anchor || anchor.roomId !== roomId))
    throw new ApiError(
      400,
      "INVALID_CURSOR",
      "메시지 커서가 올바르지 않습니다",
    );
  const where = anchor
    ? {
        roomId,
        OR: [
          { createdAt: { lt: anchor.createdAt } },
          { createdAt: anchor.createdAt, id: { lt: anchor.id } },
        ],
      }
    : { roomId };
  const fetched = await prisma.message.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 31,
    include: { sender: { select: { id: true, username: true } } },
  });
  const hasMore = fetched.length > 30;
  const messages = fetched.slice(0, 30);
  return {
    messages,
    nextCursor: hasMore ? (messages.at(-1)?.id ?? null) : null,
  };
}
