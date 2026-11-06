import { useEffect } from "react";

export function useTitle(title: string): void {
  useEffect(() => {
    document.title = title === "Dolf" ? "Dolf Tracker" : `${title} · Dolf`;
  }, [title]);
}
