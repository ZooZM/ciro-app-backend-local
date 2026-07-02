import {
  LocationBatchService,
  LocationBatchItem,
} from './location-batch.service';

function item(
  userId: string,
  overrides: Partial<LocationBatchItem> = {},
): LocationBatchItem {
  return {
    userId,
    longitude: 31.2,
    latitude: 30.05,
    isOnline: true,
    lastUpdatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('LocationBatchService (FR-006a / SC-012)', () => {
  let service: LocationBatchService;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new LocationBatchService();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('coalesces multiple updates for the same user within an interval to the latest value', () => {
    const flushHandler = jest.fn();
    service.onFlush(flushHandler);

    service.enqueue('room-1', 'user-1', item('user-1', { longitude: 1 }));
    service.enqueue('room-1', 'user-1', item('user-1', { longitude: 2 }));
    service.enqueue('room-1', 'user-1', item('user-1', { longitude: 3 }));

    jest.advanceTimersByTime(5000);

    expect(flushHandler).toHaveBeenCalledTimes(1);
    const [roomId, updates] = flushHandler.mock.calls[0];
    expect(roomId).toBe('room-1');
    expect(updates).toHaveLength(1);
    expect(updates[0].longitude).toBe(3);
  });

  it('emits one batch frame per room per flush, not per shareLocation event', () => {
    const flushHandler = jest.fn();
    service.onFlush(flushHandler);

    service.enqueue('room-1', 'user-1', item('user-1'));
    service.enqueue('room-1', 'user-2', item('user-2'));
    service.enqueue('room-2', 'user-3', item('user-3'));

    jest.advanceTimersByTime(5000);

    expect(flushHandler).toHaveBeenCalledTimes(2);
    const room1Call = flushHandler.mock.calls.find((c) => c[0] === 'room-1');
    expect(room1Call[1]).toHaveLength(2);
  });

  it('does not flush empty buckets', () => {
    const flushHandler = jest.fn();
    service.onFlush(flushHandler);

    jest.advanceTimersByTime(5000);

    expect(flushHandler).not.toHaveBeenCalled();
  });

  it('clears buckets after flushing so the next interval starts fresh', () => {
    const flushHandler = jest.fn();
    service.onFlush(flushHandler);

    service.enqueue('room-1', 'user-1', item('user-1'));
    jest.advanceTimersByTime(5000);
    expect(flushHandler).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5000);
    expect(flushHandler).toHaveBeenCalledTimes(1); // no new data, no second flush
  });

  it('cancel() drops a not-yet-flushed update so it cannot resurrect a marker just hidden', () => {
    const flushHandler = jest.fn();
    service.onFlush(flushHandler);

    service.enqueue('room-1', 'user-1', item('user-1'));
    service.enqueue('room-1', 'user-2', item('user-2'));
    service.cancel('user-1'); // e.g. stopSharingLocation arriving before the next flush tick

    jest.advanceTimersByTime(5000);

    expect(flushHandler).toHaveBeenCalledTimes(1);
    const [, updates] = flushHandler.mock.calls[0];
    expect(updates).toHaveLength(1);
    expect(updates[0].userId).toBe('user-2');
  });

  it('cancel() removes the pending update across every room the user is in', () => {
    const flushHandler = jest.fn();
    service.onFlush(flushHandler);

    service.enqueue('room-1', 'user-1', item('user-1'));
    service.enqueue('room-2', 'user-1', item('user-1'));
    service.cancel('user-1');

    jest.advanceTimersByTime(5000);

    expect(flushHandler).not.toHaveBeenCalled();
  });
});
