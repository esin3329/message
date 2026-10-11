import type { InferResponseType } from "hono/client";
import type { api } from "./api";
import type { ChatMessage } from "@repo/api/socket-types";

export type User = InferResponseType<typeof api.api.auth.me.$get, 200>["user"];
export type Room = InferResponseType<typeof api.api.rooms.$get, 200>[number];
export type MessagePage = InferResponseType<
  (typeof api.api.rooms)[":id"]["messages"]["$get"],
  200
>;
export type { ChatMessage };
