import "dotenv/config";
import { prisma } from "../src/lib/db.js";
import { hashPassword } from "../src/lib/password.js";

const accounts = [
  { username: "demo-alice", password: "Alice-chat-2026!" },
  { username: "demo-bob", password: "Bob-chat-2026!" },
];
for (const account of accounts) {
  await prisma.user.upsert({
    where: { username: account.username },
    update: {},
    create: {
      username: account.username,
      passwordHash: await hashPassword(account.password),
    },
  });
}

const [alice, bob] = await Promise.all([
  prisma.user.findUniqueOrThrow({ where: { username: "demo-alice" } }),
  prisma.user.findUniqueOrThrow({ where: { username: "demo-bob" } }),
]);
const room = await prisma.room.upsert({
  where: { id: "lhci-demo-room" },
  update: { name: "Lighthouse demo room" },
  create: {
    id: "lhci-demo-room",
    name: "Lighthouse demo room",
    members: { create: [{ userId: alice.id }, { userId: bob.id }] },
  },
});
for (const userId of [alice.id, bob.id]) {
  await prisma.roomMember.upsert({
    where: { roomId_userId: { roomId: room.id, userId } },
    update: {},
    create: { roomId: room.id, userId },
  });
}
for (const index of Array.from({ length: 30 }, (_, offset) => offset)) {
  const message = {
    id: `lhci-demo-message-${String(index + 1).padStart(2, "0")}`,
    roomId: room.id,
    senderId: index % 2 === 0 ? alice.id : bob.id,
    text: `Lighthouse benchmark message ${index + 1}: sample conversation used for stable mobile audits.`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
  };
  await prisma.message.upsert({
    where: { id: message.id },
    update: message,
    create: message,
  });
}
await prisma.$disconnect();
