import { vi } from 'vitest';

type Handler = (payload?: unknown) => void;

/**
 * Stands in for lib/socket's socket.io client. Records what the app emits and lets a test
 * play the server's side with `receive`. Use via:
 *   vi.mock('../lib/socket', () => import('../test/fakeSocket'));
 */
function createFakeSocket() {
  const handlers = new Map<string, Set<Handler>>();
  const emitted: { event: string; payload: unknown; volatile: boolean }[] = [];

  const fake = {
    connected: true,
    emitted,
    on: vi.fn((event: string, handler: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return fake;
    }),
    off: vi.fn((event: string, handler: Handler) => {
      handlers.get(event)?.delete(handler);
      return fake;
    }),
    emit: vi.fn((event: string, payload?: unknown) => {
      emitted.push({ event, payload, volatile: false });
      return fake;
    }),
    volatile: {
      emit: vi.fn((event: string, payload?: unknown) => {
        emitted.push({ event, payload, volatile: true });
        return fake;
      }),
    },
    connect: vi.fn(() => fake),
    disconnect: vi.fn(() => fake),

    /** Delivers a server -> client event to every registered handler. */
    receive(event: string, payload?: unknown) {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
    listenerCount(event: string) {
      return handlers.get(event)?.size ?? 0;
    },
    /** Payloads the app emitted for `event`, oldest first. */
    sent(event: string) {
      return emitted.filter((e) => e.event === event).map((e) => e.payload);
    },
    reset() {
      handlers.clear();
      emitted.length = 0;
      fake.connected = true;
      vi.clearAllMocks();
    },
  };
  return fake;
}

export const socket = createFakeSocket();
export type FakeSocket = typeof socket;
