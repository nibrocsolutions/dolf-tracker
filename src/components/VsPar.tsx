import { formatAverage, formatVsPar, vsParClass } from "../lib/scoring";

export function VsPar({
  diff,
  scored = true,
  average = false,
}: {
  diff: number;
  scored?: boolean;
  average?: boolean;
}) {
  if (!scored) return <span className="vs-even">–</span>;
  const shown = average ? Math.round(diff * 10) / 10 : diff;
  return <span className={vsParClass(shown)}>{average ? formatAverage(diff) : formatVsPar(diff)}</span>;
}
