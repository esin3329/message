import type { ReactElement } from "react";
import type { ChatMessage } from "../types";

export function MessageBubble({
  message,
  own,
}: {
  message: ChatMessage;
  own: boolean;
}): ReactElement {
  return (
    <article className={`message ${own ? "message-own" : ""}`}>
      {!own && (
        <span className="message-avatar" aria-hidden="true">
          {message.sender.username.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="message-body">
        {!own && (
          <span className="message-author">{message.sender.username}</span>
        )}
        <p>{message.text}</p>
        <time dateTime={message.createdAt}>
          {new Date(message.createdAt).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
    </article>
  );
}
