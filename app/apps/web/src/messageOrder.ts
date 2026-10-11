// Server pages are createdAt DESC, id DESC (directive §7.2). A buffered live
// message that falls outside the latest 30 must join that order. Prepending it
// as the newest row also re-announces it over the latest message (N11).

export type OrderedMessage = {
  id: string;
  createdAt: string;
};

export function isNewerMessage(a: OrderedMessage, b: OrderedMessage): boolean {
  const aTime = Date.parse(a.createdAt);
  const bTime = Date.parse(b.createdAt);
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
    return aTime > bTime;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt;
  return a.id > b.id;
}

type MessagePageLike<T extends OrderedMessage> = {
  messages: readonly T[];
};

export type LiveMergePlan<
  T extends OrderedMessage,
  P extends MessagePageLike<T>,
> = {
  pages: P[];
  announce: boolean;
  prepended: boolean;
  changed: boolean;
};

export function planLiveMerge<
  T extends OrderedMessage,
  P extends MessagePageLike<T>,
>(pages: readonly P[], message: T): LiveMergePlan<T, P> {
  const known = pages.some((page) =>
    page.messages.some((item) => item.id === message.id),
  );
  if (known || pages.length === 0) {
    return {
      pages: [...pages],
      announce: false,
      prepended: false,
      changed: false,
    };
  }
  const newest = pages[0]?.messages[0];
  const oldest = pages.at(-1)?.messages.at(-1);
  return {
    pages: insertMessageByTotalOrder(pages, message),
    announce: newest === undefined || isNewerMessage(message, newest),
    prepended: oldest !== undefined && isNewerMessage(oldest, message),
    changed: true,
  };
}

function insertMessageByTotalOrder<
  T extends OrderedMessage,
  P extends MessagePageLike<T>,
>(pages: readonly P[], message: T): P[] {
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    if (!page) continue;
    const index = page.messages.findIndex((item) =>
      isNewerMessage(message, item),
    );
    if (index === -1) continue;
    const next = pages.slice();
    next[pageIndex] = {
      ...page,
      messages: [
        ...page.messages.slice(0, index),
        message,
        ...page.messages.slice(index),
      ],
    };
    return next;
  }
  const lastIndex = pages.length - 1;
  const last = pages[lastIndex];
  if (!last) return [...pages];
  const next = pages.slice();
  next[lastIndex] = { ...last, messages: [...last.messages, message] };
  return next;
}
