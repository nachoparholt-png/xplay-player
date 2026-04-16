import { useState, useEffect, useRef, useCallback } from 'react';
import { useNetworkStatus } from './useNetworkStatus';

export interface QueuedOperation {
  /** Unique key — re-enqueueing the same id replaces the previous entry. */
  id: string;
  /** Human-readable description shown in toasts. */
  label: string;
  /** The async work to perform. Should throw on failure. */
  fn: () => Promise<void>;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

/**
 * In-memory retry queue that auto-flushes when the device comes back online.
 *
 * Usage:
 *   const { isOnline, enqueue, pendingCount } = useOfflineQueue();
 *
 *   if (!isOnline) {
 *     enqueue({ id: 'unique-op-id', label: 'Join match', fn: myOp, onSuccess, onError });
 *   }
 */
export function useOfflineQueue() {
  const { isOnline } = useNetworkStatus();
  const [queue, setQueue] = useState<QueuedOperation[]>([]);
  const flushingRef = useRef(false);

  /** Add (or replace) an operation in the queue. */
  const enqueue = useCallback((op: QueuedOperation) => {
    setQueue(prev => {
      const filtered = prev.filter(o => o.id !== op.id);
      return [...filtered, op];
    });
  }, []);

  /** Remove an operation from the queue by id. */
  const dequeue = useCallback((id: string) => {
    setQueue(prev => prev.filter(o => o.id !== id));
  }, []);

  /** Auto-flush all pending operations when the connection is restored. */
  useEffect(() => {
    if (!isOnline || flushingRef.current || queue.length === 0) return;

    const flush = async () => {
      flushingRef.current = true;
      const snapshot = [...queue];
      setQueue([]);

      for (const op of snapshot) {
        try {
          await op.fn();
          op.onSuccess?.();
        } catch (err) {
          op.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }

      flushingRef.current = false;
    };

    flush();
  }, [isOnline, queue]);

  return {
    isOnline,
    queue,
    pendingCount: queue.length,
    enqueue,
    dequeue,
  };
}
