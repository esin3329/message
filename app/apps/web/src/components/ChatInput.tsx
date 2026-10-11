import { useState, type FormEvent, type ReactElement } from "react";
import { getSocket } from "../socket";

export function ChatInput({
  roomId,
  onSent,
}: {
  roomId: string;
  onSent: (id: string) => void;
}): ReactElement {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const socket = getSocket();
    const cleanText = text.trim();
    if (!socket?.connected || !cleanText || pending) {
      if (!socket?.connected) {
        setError("연결이 끊겼습니다. 잠시 후 다시 시도해 주세요.");
        setStatus("메시지 전송에 실패했습니다");
      }
      return;
    }
    setPending(true);
    setError("");
    setStatus("메시지 전송 중");
    socket
      .timeout(10_000)
      .emit(
        "message:send",
        { roomId, text: cleanText },
        (timeoutError, result) => {
          setPending(false);
          if (timeoutError || !result) {
            setError(
              "전송 결과를 확인하지 못했습니다. 대화 이력을 새로고침해 주세요.",
            );
            setStatus("메시지 전송에 실패했습니다");
            return;
          }
          if ("error" in result) {
            setError(result.error.message);
            setStatus("메시지 전송에 실패했습니다");
            return;
          }
          onSent(result.id);
          setText("");
          setStatus("메시지가 전송되었습니다");
          window.setTimeout(() => setStatus(""), 2000);
        },
      );
  }
  return (
    <form className="chat-composer" onSubmit={submit}>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
      <label htmlFor="message-input">메시지 입력</label>
      <textarea
        id="message-input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="메시지를 입력하세요…"
        rows={1}
      />
      <button
        type="submit"
        className="send-button"
        disabled={pending || !text.trim()}
        aria-label="메시지 보내기"
      >
        <span aria-hidden="true">↗</span>
      </button>
    </form>
  );
}
