"use client";

export function RevenueBars({
  series,
  currencyLabel,
}: {
  series: Array<{ bucket: string; amountMinor: number }>;
  currencyLabel: string;
}) {
  const max = Math.max(...series.map((s) => s.amountMinor), 1);
  if (series.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">Aucune donnée de CA.</p>
    );
  }
  return (
    <div className="space-y-2">
      {series.map((s) => (
        <div key={s.bucket} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-xs">
          <span className="truncate text-[var(--muted)]">{s.bucket}</span>
          <div className="h-3 overflow-hidden rounded bg-[var(--surface-2)]">
            <div
              className="h-full rounded bg-[var(--brand)]"
              style={{ width: `${Math.max(4, (s.amountMinor / max) * 100)}%` }}
            />
          </div>
          <span className="tabular-nums">
            {(s.amountMinor / 100).toFixed(0)} {currencyLabel}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ChannelBars({
  channels,
}: {
  channels: Array<{ source: string; events: number }>;
}) {
  const max = Math.max(...channels.map((c) => c.events), 1);
  return (
    <div className="space-y-2">
      {channels.map((c) => (
        <div
          key={c.source}
          className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-xs"
        >
          <span className="uppercase text-[var(--muted)]">{c.source}</span>
          <div className="h-3 overflow-hidden rounded bg-[var(--surface-2)]">
            <div
              className="h-full rounded bg-[var(--ink)]/70"
              style={{ width: `${Math.max(c.events ? 4 : 0, (c.events / max) * 100)}%` }}
            />
          </div>
          <span className="tabular-nums">{c.events}</span>
        </div>
      ))}
    </div>
  );
}
