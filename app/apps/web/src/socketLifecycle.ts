// Tracks whether a live socket exists so auth code can ask WITHOUT loading the socket chunk
// (N07): the contract loads socket.io-client only after a successful login, so the
// unauthenticated entry must not import "../socket" just to check for a socket to clean up.
// socket.ts (loaded only after authentication) keeps this flag in sync.
let active = false;

export function markSocketActive(value: boolean): void {
  active = value;
}

export function hasActiveSocket(): boolean {
  return active;
}
