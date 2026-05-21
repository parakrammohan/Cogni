import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { safeRead, safeWrite } from "../lib/storage";

export function usePersistentState<T>(key: string, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => safeRead(key, fallback));

  useEffect(() => {
    safeWrite(key, value);
  }, [key, value]);

  return [value, setValue];
}
