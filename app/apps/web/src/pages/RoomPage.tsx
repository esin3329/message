import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  hashKey,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { api } from "../api";
import { ChatInput } from "../components/ChatInput";
import { MessageBubble } from "../components/MessageBubble";
import { ThemeToggle } from "../components/Inputs";
import { useAuth } from "../hooks/AuthContext";
import { planLiveMerge } from "../messageOrder";
import type { ChatMessage, MessagePage, Room } from "../types";

export default function RoomPage(): ReactElement {
  const { roomId = "" } = useParams();
  return <RoomConversation key={roomId} roomId={roomId} />;
}

function RoomConversation({ roomId }: { roomId: string }): ReactElement {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listRef = useRef<VirtuosoHandle>(null);
  const loadingPrevious = useRef(false);
  const [firstItemIndex, setFirstItemIndex] = useState(1_000_000);
  const [isPrepending, setIsPrepending] = useState(false);
  const pendingPrependCount = useRef(0);
  const [atBottom, setAtBottom] = useState(true);
  const [liveMessage, setLiveMessage] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const roomQuery = useQuery({
    queryKey: ["rooms"],
    queryFn: async (): Promise<Room[]> => {
      const response = await api.api.rooms.$get();
      if (!response.ok) throw new Error("대화방 목록을 불러오지 못했습니다");
      return response.json();
    },
  });
  const room = roomQuery.data?.find((item) => item.id === roomId);
  const member = Boolean(room?.isMember);
  const messagesQuery = useInfiniteQuery({
    queryKey: ["messages", roomId],
    enabled: member,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<MessagePage> => {
      const response = await api.api.rooms[":id"].messages.$get({
        param: { id: roomId },
        query: pageParam ? { cursor: pageParam } : {},
      });
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? "대화방 참여자만 메시지를 볼 수 있습니다"
            : "메시지를 불러오지 못했습니다",
        );
      return response.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  // Deduplicate by id so a live message that arrives during initial history loading is not rendered twice
  // once the refetched page containing it resolves.
  const messages = useMemo(() => {
    const merged =
      messagesQuery.data?.pages
        .slice()
        .reverse()
        .flatMap((page) => page.messages.slice().reverse()) ?? [];
    const seen = new Set<string>();
    return merged.filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    });
  }, [messagesQuery.data]);
  const hasMore = Boolean(messagesQuery.hasNextPage);
  const refetchMessages = messagesQuery.refetch;
  const fetchOlderPage = messagesQuery.fetchNextPage;

  // 초기 이력 응답 전이나 refetch/fetchNextPage 진행 중에 수신된 실시간 메시지는 응답이 캐시를 덮어쓸 때 유실되므로 보관한다 (N04).
  const pendingLive = useRef<ChatMessage[]>([]);
  // 재연결 refetch 직전에만 동기 설정되는 보관 플래그. 일반 진행 상태는 이벤트 시점의
  // queryClient.isFetching 동기 조회로 판정해, invalidate 호출과 live 수신이 같은 tick에
  // 일어나도(렌더 미러가 아직 이전 값인 창) 유실되지 않게 한다 (N04).
  const bufferingHistory = useRef(false);
  const updateMessages = useCallback(
    (message: ChatMessage) => {
      if (message.roomId !== roomId) return;
      const key = ["messages", roomId] as const;
      const current = queryClient.getQueryData<{
        pages: MessagePage[];
        pageParams: (string | undefined)[];
      }>(key);
      // 캐시에 이미 있는 id는 목록·알림 모두 다시 적용하지 않는다.
      const known =
        current?.pages.some((page) =>
          page.messages.some((item) => item.id === message.id),
        ) ?? false;
      if (known) return;
      // fetchStatus 기준으로 판정한다. isFetching은 fetchStatus==='fetching'만 세므로
      // retry 일시정지(paused)를 진행 중으로 보지 못하고, 그 사이 캐시에 직접 추가한 live가
      // 재개된 이력 응답 snapshot에 덮어써져 유실된다 (N04).
      const historyFetching =
        bufferingHistory.current ||
        queryClient.getQueryState(key)?.fetchStatus !== "idle";
      if (!current || historyFetching) {
        if (!pendingLive.current.some((item) => item.id === message.id)) {
          pendingLive.current.push(message);
          setLiveMessage({
            id: message.id,
            label: `${message.sender.username}: ${message.text}`,
          });
        }
        return;
      }
      // 서버 페이지는 createdAt DESC, id DESC다. 최신 30건 밖에 남은 오래된 buffered
      // live를 항상 pages[0] 맨 앞에 붙이면 최신 자리로 올라가고, 이미 알린 최신
      // 메시지를 그 오래된 메시지로 다시 덮는다 (N11). 총순서 자리에 넣고, 캐시에
      // 이미 있는 최신 메시지보다 오래된 경우에는 재공지하지 않는다.
      const merged = planLiveMerge(current.pages, message);
      if (merged.changed) {
        queryClient.setQueryData<{
          pages: MessagePage[];
          pageParams: (string | undefined)[];
        }>(key, (existing) => {
          if (!existing) return existing;
          const next = planLiveMerge(existing.pages, message);
          if (!next.changed) return existing;
          return { ...existing, pages: next.pages };
        });
      }
      // 같은 문구의 연속 메시지도 알리도록 메시지 id를 함께 추적 (key 재마운트로 live region 갱신).
      // 정산으로 들어온 오래된 메시지는 최신 알림을 유지한다 (N11).
      if (merged.announce) {
        setLiveMessage({
          id: message.id,
          label: `${message.sender.username}: ${message.text}`,
        });
      }
    },
    [queryClient, roomId],
  );
  // 진행 중인 이력 fetch가 없어진 시점에만 버퍼를 해제하고 병합한다. fetch 진행 중에 해제하면
  // 이후 도착하는 live가 캐시에 직접 추가됐다가 응답 snapshot에 덮어써져 유실된다 (N04).
  // data가 있는 종결 상태에서만 정산한다. 최종 오류처럼 data가 없는 상태에서 정산하면
  // updateMessages가 캐시 부재로 같은 메시지를 다시 버퍼에 넣고 알림 state를 갱신해,
  // 그 렌더가 observer options 이벤트를 유발하고 다시 정산을 부르는 루프가 된다 (N10).
  const settleHistoryBuffer = useCallback(() => {
    const key = ["messages", roomId] as const;
    // paused도 아직 종결이 아니다. retry 재개 시 처음 캡처한 oldPages로 응답이 완성되므로,
    // paused 사이에 정산해 캐시에 넣은 live는 그 snapshot에 덮어써져 유실된다 (N04).
    if (queryClient.getQueryState(key)?.fetchStatus !== "idle") return;
    if (!queryClient.getQueryData(key)) return;
    bufferingHistory.current = false;
    const buffered = pendingLive.current.splice(0);
    for (const message of buffered) updateMessages(message);
  }, [queryClient, roomId, updateMessages]);
  // 캐시가 처음 생기는 순간과, 동일 snapshot이라 데이터 identity가 변하지 않은 refetch 완료
  // 시점 모두에서 보관해 둔 실시간 메시지를 병합한다 (중복 검사는 updateMessages가 수행).
  // fetch 플래그를 deps에 포함해야 structural sharing으로 data가 그대로인 완료 전환도 잡힌다 (N04).
  useEffect(() => {
    if (bufferingHistory.current) return;
    if (!messagesQuery.data || pendingLive.current.length === 0) return;
    const buffered = pendingLive.current.splice(0);
    for (const message of buffered) updateMessages(message);
  }, [
    messagesQuery.data,
    messagesQuery.isPending,
    messagesQuery.isRefetching,
    messagesQuery.isFetchingNextPage,
    updateMessages,
  ]);

  // 어떤 경로의 refetch라도 완료되면 버퍼를 정산한다. join의 invalidate처럼 settle continuation이
  // 직접 붙지 않는 refetch가 같은-snapshot 응답으로 다음 React commit 전에 끝나면, structural
  // sharing으로 data identity와 fetch 플래그가 모두 그대로라 위 drain effect가 재실행되지 않고
  // 버퍼가 미정산 상태로 남는다 (N04). 캐시 이벤트 구독은 렌더 여부와 무관하게 완료 전환을 잡는다.
  // settleHistoryBuffer는 진행 중인 fetch가 있으면 early-return하므로 중복 호출은 안전하다.
  useEffect(() => {
    const hash = hashKey(["messages", roomId]);
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryHash === hash) settleHistoryBuffer();
    });
  }, [queryClient, roomId, settleHistoryBuffer]);

  useEffect(() => {
    let cleanup = (): void => {};
    let active = true;
    // Socket code is loaded only after authentication, keeping it out of the public login entry chunk.
    // The persistent socket survives token refresh, so listeners attach to the socket itself rather than a single generation.
    void import("../socket").then(({ onNewMessage, onSocketConnect }) => {
      if (!active) return;
      const offMessages = onNewMessage((message) => updateMessages(message));
      const offConnect = onSocketConnect(() => {
        // 재연결 시점의 최신 쿼리 상태를 읽어, 초기 이력이 로드된 경우에만 누락 복구를 위해 다시 가져온다.
        const state = queryClient.getQueryState(["messages", roomId]);
        if (!state || state.dataUpdatedAt === 0) return;
        bufferingHistory.current = true;
        // Refetch replaced the cache with the server snapshot; merge live messages that
        // arrived during the fetch so they are not lost (N04).
        void refetchMessages().finally(settleHistoryBuffer);
      });
      cleanup = () => {
        offMessages();
        offConnect();
      };
    });
    return () => {
      active = false;
      cleanup();
    };
  }, [
    roomId,
    updateMessages,
    refetchMessages,
    queryClient,
    settleHistoryBuffer,
  ]);

  const join = async (): Promise<void> => {
    const response = await api.api.rooms[":id"].members.me.$post({
      param: { id: roomId },
    });
    if (!response.ok) {
      navigate("/rooms");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["rooms"] });
    await queryClient.invalidateQueries({ queryKey: ["messages", roomId] });
  };

  const loadOlder = useCallback(async () => {
    if (loadingPrevious.current || !hasMore) return;
    loadingPrevious.current = true;
    // Start buffering live messages synchronously, before the first render that mirrors
    // isFetchingNextPage into the query state: a live message arriving in this window must
    // not be appended to the cache directly, or the fetchNextPage snapshot clobbers it (N04).
    bufferingHistory.current = true;
    setIsPrepending(true);
    try {
      const before = queryClient.getQueryData<{
        pages: MessagePage[];
        pageParams: (string | undefined)[];
      }>(["messages", roomId]);
      const knownIds = new Set(
        before?.pages.flatMap((page) =>
          page.messages.map((message) => message.id),
        ) ?? [],
      );
      const result = await fetchOlderPage();
      // 실제로 새로 추가된 고유 메시지 id 수만큼만 창을 이동한다.
      // 취소되었거나 중복 id만 있는 응답은 firstItemIndex를 건드리지 않는다 (F07).
      if (result.status === "success") {
        const beforeCount = before?.pages.length ?? 0;
        const newPages = result.data.pages.slice(beforeCount);
        const added = new Set(
          newPages
            .flatMap((page) => page.messages)
            .map((message) => message.id)
            .filter((id) => !knownIds.has(id)),
        ).size;
        if (added > 0) {
          pendingPrependCount.current = added;
          setFirstItemIndex((index) => Math.max(1, index - added));
        } else {
          setIsPrepending(false);
        }
      } else {
        setIsPrepending(false);
      }
    } finally {
      loadingPrevious.current = false;
      // Release buffering and merge whatever arrived during the page fetch (N04).
      settleHistoryBuffer();
    }
  }, [hasMore, fetchOlderPage, queryClient, roomId, settleHistoryBuffer]);

  // Prepend 데이터가 렌더에 반영된 후에만 isPrepending을 해제해 followOutput 차단을 유지한다 (F07).
  useEffect(() => {
    if (!isPrepending || pendingPrependCount.current === 0) return;
    pendingPrependCount.current = 0;
    setIsPrepending(false);
  }, [messages, isPrepending]);

  if (roomQuery.isPending)
    return <main className="loading-screen">대화방 불러오는 중…</main>;
  if (!room || !user)
    return (
      <main className="loading-screen">
        <p>대화방을 찾을 수 없습니다.</p>
        <Link to="/rooms">목록으로</Link>
      </main>
    );

  return (
    <main className="chat-layout">
      <header className="chat-header">
        <Link className="back-button" to="/rooms" aria-label="대화방 목록으로">
          ←
        </Link>
        <div className="chat-title">
          <span className="room-mark">#</span>
          <div>
            <h1>{room.name}</h1>
            <p>{room._count?.members ?? 0}명이 함께하는 대화</p>
          </div>
        </div>
        <div className="header-actions">
          <ThemeToggle />
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
      {!member ? (
        <section className="join-panel">
          <span className="join-star" aria-hidden="true">
            ✳
          </span>
          <h2>이 대화에 참여해 보세요</h2>
          <p>대화방에 참여하면 메시지 기록을 읽고 대화를 나눌 수 있어요.</p>
          <button
            className="primary-button"
            onClick={() => {
              void join();
            }}
          >
            대화방 참여하기 <span aria-hidden="true">→</span>
          </button>
        </section>
      ) : (
        <>
          <section className="conversation" aria-label={`${room.name} 메시지`}>
            {messages.length > 0 ? (
              <Virtuoso
                key={roomId}
                ref={listRef}
                data={messages}
                firstItemIndex={firstItemIndex}
                alignToBottom
                initialTopMostItemIndex={
                  messages.length
                    ? { index: messages.length - 1, align: "end" }
                    : undefined
                }
                computeItemKey={(_index, message) => message.id}
                startReached={() => {
                  void loadOlder();
                }}
                atBottomStateChange={setAtBottom}
                followOutput={(isAtBottom) =>
                  isPrepending
                    ? false
                    : isAtBottom || messages.at(-1)?.senderId === user.id
                      ? "auto"
                      : false
                }
                itemContent={(_index, message) => (
                  <MessageBubble
                    message={message}
                    own={message.senderId === user.id}
                  />
                )}
                components={{
                  Footer: () =>
                    messagesQuery.isFetchingNextPage ? (
                      <p className="history-loading">
                        이전 메시지를 불러오는 중…
                      </p>
                    ) : null,
                }}
              />
            ) : (
              <div className="conversation-empty">
                첫 메시지를 남겨 대화를 시작해 보세요.
              </div>
            )}
            <div
              className="sr-only"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label="새 메시지 알림"
            >
              {liveMessage ? (
                <span key={liveMessage.id}>{liveMessage.label}</span>
              ) : null}
            </div>
          </section>
          {messagesQuery.isError && (
            <p className="form-error" role="alert">
              {messagesQuery.error.message}
            </p>
          )}
          <ChatInput
            roomId={roomId}
            onSent={(id) => {
              const message = messages.find((item) => item.id === id);
              if (message || atBottom)
                listRef.current?.scrollToIndex({
                  index: "LAST",
                  align: "end",
                  behavior: "auto",
                });
            }}
          />
        </>
      )}
    </main>
  );
}
