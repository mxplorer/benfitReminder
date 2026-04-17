import { useCardStore } from "./useCardStore";

/** Subscribes to the store's monotonic `now` so consumers re-render whenever
 * recalculate() is called (startup, focus, midnight). */
export const useToday = (): Date => useCardStore((s) => s.now);
