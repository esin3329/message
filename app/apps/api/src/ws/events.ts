export type ChatMessage = {
  id: string;
  roomId: string;
  senderId: string;
  text: string;
  createdAt: string;
  sender: { id: string; username: string };
};

export type Ack<T> = T | { error: { code: string; message: string } };
export type ClientToServerEvents = {
  "message:send": (
    payload: { roomId: string; text: string },
    ack: (result: Ack<ChatMessage>) => void,
  ) => void;
};
export type ServerToClientEvents = {
  "message:new": (message: ChatMessage) => void;
};
export type InterServerEvents = Record<string, never>;
export type SocketData = {
  userId: string;
  sessionId: string;
  familyId: string;
  expiresAt: number;
  // True only after the async post-connection session re-validation passed and rooms were joined.
  // Until then the socket receives no broadcasts and send attempts are queued or rejected.
  validated: boolean;
};
