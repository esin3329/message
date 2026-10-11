import { useState, type FormEvent, type ReactElement } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { api } from "../api";
import { useAuth } from "../hooks/AuthContext";
import { ThemeToggle } from "../components/Inputs";
import { RoomListItem } from "../components/RoomListItem";

export default function RoomListPage(): ReactElement {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [roomName, setRoomName] = useState("");
  const [error, setError] = useState("");
  const roomsQuery = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      const response = await api.api.rooms.$get();
      if (!response.ok) throw new Error("대화방 목록을 불러오지 못했습니다");
      return response.json();
    },
  });
  async function createRoom(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    const response = await api.api.rooms.$post({ json: { name: roomName } });
    if (!response.ok) {
      setError("대화방을 만들지 못했습니다");
      return;
    }
    const room = await response.json();
    await queryClient.invalidateQueries({ queryKey: ["rooms"] });
    navigate(`/rooms/${room.id}`);
  }
  async function joinRoom(roomId: string): Promise<void> {
    const response = await api.api.rooms[":id"].members.me.$post({
      param: { id: roomId },
    });
    if (!response.ok) {
      setError("대화방에 참여하지 못했습니다");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["rooms"] });
    navigate(`/rooms/${roomId}`);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <Link className="brand" to="/rooms">
          <span className="brand-icon">m</span> 모아
        </Link>
        <div className="header-actions">
          <ThemeToggle />
          <span className="user-chip">
            <span className="avatar">
              {user?.username.slice(0, 1).toUpperCase()}
            </span>
            {user?.username}
          </span>
          <button
            className="quiet-button"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            로그아웃
          </button>
        </div>
      </header>
      <section className="welcome-panel">
        <div>
          <span className="eyebrow">YOUR SPACE</span>
          <h1>어떤 이야기를 나눌까요?</h1>
          <p>관심 있는 대화방에 참여하거나 새 대화를 시작해 보세요.</p>
        </div>
        <div className="welcome-illustration" aria-hidden="true">
          <span>✳</span>
          <span>•••</span>
        </div>
      </section>
      <section className="room-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">COMMUNITY</span>
            <h2>공개 대화방</h2>
          </div>
          <span className="section-count">
            {roomsQuery.data?.length ?? 0}개의 공간
          </span>
        </div>
        <form
          className="create-room-form"
          onSubmit={(event) => {
            void createRoom(event);
          }}
        >
          <label htmlFor="new-room">새 대화방 이름</label>
          <input
            id="new-room"
            required
            placeholder="새 대화방 이름"
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
          />
          <button type="submit" className="primary-button">
            새 방 만들기 <span aria-hidden="true">+</span>
          </button>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {roomsQuery.isPending ? (
          <p className="empty-state">대화방을 불러오는 중…</p>
        ) : roomsQuery.isError ? (
          <p className="form-error" role="alert">
            {roomsQuery.error.message}
          </p>
        ) : roomsQuery.data.length ? (
          <div className="room-list">
            {roomsQuery.data.map((room) => (
              <div className="room-row" key={room.id}>
                <RoomListItem room={room} />
                {room.isMember ? (
                  <Link className="join-link" to={`/rooms/${room.id}`}>
                    열기
                  </Link>
                ) : (
                  <button
                    className="join-link"
                    onClick={() => {
                      void joinRoom(room.id);
                    }}
                  >
                    참여하기
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span aria-hidden="true">✳</span>
            <h3>아직 대화방이 없어요</h3>
            <p>첫 번째 대화방을 만들고 이야기를 시작해 보세요.</p>
          </div>
        )}
      </section>
    </main>
  );
}
