// Loading data for a screen: the value once it arrives, the error if it failed, and a way to load it again.
// A response that arrives after the screen moved on (unmounted or new inputs) is ignored.
import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";

export interface AsyncData<T> {
  data: T | undefined;
  error: string;
  reload: () => Promise<void>;
  /** Replace the loaded value locally (after a change the screen already knows about). */
  setData: (value: T) => void;
}

export function useAsyncData<T>(load: () => Promise<T>, dependencies: DependencyList): AsyncData<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState("");
  const latestRequest = useRef(0);

  // The dependencies are the caller's: `load` is a new closure on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableLoad = useCallback(load, dependencies);

  const reload = useCallback(async () => {
    const request = ++latestRequest.current;
    setError("");
    try {
      const value = await stableLoad();
      if (request === latestRequest.current) setData(value);
    } catch (failure) {
      if (request === latestRequest.current) setError((failure as Error).message);
    }
  }, [stableLoad]);

  /** Make any response still in flight count as outdated. */
  const ignorePendingResponses = useCallback(() => { latestRequest.current++; }, []);

  useEffect(() => {
    void reload();
    return ignorePendingResponses;
  }, [reload, ignorePendingResponses]);

  return { data, error, reload, setData };
}
