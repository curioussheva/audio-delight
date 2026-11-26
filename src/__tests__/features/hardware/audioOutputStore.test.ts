// src/__tests__/features/hardware/audioOutputStore.test.ts
//
// POLL-1: audioOutputStore — satu poller 3 detik + satu langganan
// PristineDeviceChange bersama, ber-ref-count: mulai saat subscriber
// pertama, berhenti saat subscriber terakhir pergi; dua subscriber =
// satu interval, satu subscription, satu spike event.

const mockListDevices = jest.fn(async () => []);
const mockGetStatus = jest.fn(async () => null);
const mockGetCurrentDevice = jest.fn(async () => null);
const mockGetBluetoothCodec = jest.fn(async () => ({
  connected: false,
  deviceName: "",
  address: "",
}));
const mockUnsubscribeDeviceChanges = jest.fn();
let mockDeviceChangeListener: (() => void) | null = null;

jest.mock("@/features/hardware/api/audioOutput", () => ({
  __esModule: true,
  default: {
    listDevices: mockListDevices,
    getStatus: mockGetStatus,
    getCurrentDevice: mockGetCurrentDevice,
    getBluetoothCodec: mockGetBluetoothCodec,
    selectDevice: jest.fn(async () => true),
    clearSelection: jest.fn(async () => true),
    subscribeDeviceChanges: (listener: () => void) => {
      mockDeviceChangeListener = listener;
      return mockUnsubscribeDeviceChanges;
    },
  },
}));

jest.useFakeTimers();

async function loadStore() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAudioOutputStore } = require("@/features/hardware/store/audioOutputStore");
  return useAudioOutputStore;
}

describe("audioOutputStore — POLL-1 ref-count", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeviceChangeListener = null;
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it("subscriber pertama: 1 subscription event + 1 interval + refresh awal", async () => {
    const useAudioOutputStore = await loadStore();
    const unsub = useAudioOutputStore.getState().subscribe();
    await jest.advanceTimersByTimeAsync(0);

    expect(mockListDevices).toHaveBeenCalledTimes(1);
    expect(mockGetStatus).toHaveBeenCalledTimes(1);
    expect(mockGetCurrentDevice).toHaveBeenCalledTimes(1);

    // Satu tick poller (3 detik) = satu syncStatus lagi, bukan dua.
    await jest.advanceTimersByTimeAsync(3000);
    expect(mockGetStatus).toHaveBeenCalledTimes(2);
    expect(mockGetCurrentDevice).toHaveBeenCalledTimes(2);

    unsub();
  });

  it("dua subscriber: tetap 1 subscription + 1 interval", async () => {
    const useAudioOutputStore = await loadStore();
    const store = useAudioOutputStore.getState();
    const unsub1 = store.subscribe();
    const unsub2 = store.subscribe();
    await jest.advanceTimersByTimeAsync(0);

    expect(mockListDevices).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(6000);
    // 1 refresh awal + 2 tick = 3 syncStatus, bukan 6.
    expect(mockGetStatus).toHaveBeenCalledTimes(3);

    // Lepas satu: poller tetap jalan.
    unsub1();
    await jest.advanceTimersByTimeAsync(3000);
    expect(mockGetStatus).toHaveBeenCalledTimes(4);
    expect(mockUnsubscribeDeviceChanges).not.toHaveBeenCalled();

    unsub2();
  });

  it("subscriber terakhir pergi: interval berhenti + langganan event dilepas", async () => {
    const useAudioOutputStore = await loadStore();
    const unsub = useAudioOutputStore.getState().subscribe();
    await jest.advanceTimersByTimeAsync(0);
    expect(mockGetStatus).toHaveBeenCalledTimes(1);

    unsub();
    await jest.advanceTimersByTimeAsync(9000);
    expect(mockGetStatus).toHaveBeenCalledTimes(1);
    expect(mockUnsubscribeDeviceChanges).toHaveBeenCalledTimes(1);
  });

  it("event PristineDeviceChange memicu refresh (tanpa menunggu tick)", async () => {
    const useAudioOutputStore = await loadStore();
    const unsub = useAudioOutputStore.getState().subscribe();
    await jest.advanceTimersByTimeAsync(0);
    expect(mockDeviceChangeListener).not.toBeNull();

    mockDeviceChangeListener?.();
    await jest.advanceTimersByTimeAsync(0);
    expect(mockListDevices).toHaveBeenCalledTimes(2);

    unsub();
  });

  it("subscribe lagi sesudah 0: poller + langganan dimulai ulang", async () => {
    const useAudioOutputStore = await loadStore();
    const store = useAudioOutputStore.getState();
    const unsub1 = store.subscribe();
    await jest.advanceTimersByTimeAsync(0);
    unsub1();
    expect(mockUnsubscribeDeviceChanges).toHaveBeenCalledTimes(1);

    const unsub2 = store.subscribe();
    await jest.advanceTimersByTimeAsync(0);
    expect(mockListDevices).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(3000);
    expect(mockGetStatus).toHaveBeenCalledTimes(3);

    unsub2();
  });
});
