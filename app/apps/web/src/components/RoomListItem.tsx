import type { ReactElement } from "react";
import { Link } from "react-router";
import type { Room } from "../types";

export function RoomListItem({ room }: { room: Room }): ReactElement {
  return (
    <Link className="room-item" to={`/rooms/${room.id}`}>
      <span className="room-mark" aria-hidden="true">
        #
      </span>
      <span className="room-copy">
        <strong>{room.name}</strong>
        <small>
          {room._count.members}명 참여 ·{" "}
          {new Date(room.createdAt).toLocaleDateString("ko-KR")}
        </small>
      </span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}
