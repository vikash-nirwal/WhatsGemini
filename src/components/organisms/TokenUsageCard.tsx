import React, { useState } from "react";
import { SettingsCard, SettingsCardHeader } from "src/components/molecules/settings-card";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { purposeLabel, tokenUsageSince } from "src/features/spending/tokenUsage";

const RANGES = [
  { value: "1", label: "Today" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
];

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

// Where the tokens go (tokenUsage.ts): every text call, by what it was for.
// "Sent" is what the model read (prompt, notes and history), usually most
// of it; "written" is what it wrote back.
const TokenUsageCard = () => {
  const [days, setDays] = useState("7");
  const rows = tokenUsageSince(Number(days));
  const total = rows.reduce((sum, r) => sum + r.input + r.output, 0);
  return (
    <section aria-label="Where the tokens go">
    <SettingsCard>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <SettingsCardHeader title="Where the tokens go" hint="Every text call on this device, by what it was for" />
        <SegmentedControl aria-label="Token range" value={days} onChange={setDays} options={RANGES} />
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 pt-3 text-[13px] text-subtle">Nothing counted yet. It starts with the next reply.</p>
      ) : (
        <div className="overflow-x-auto px-5 pb-5 pt-3">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-subtle">
                <th className="py-1.5 font-medium">For</th>
                <th className="py-1.5 pl-3 text-right font-medium">Calls</th>
                <th className="py-1.5 pl-3 text-right font-medium">Sent</th>
                <th className="py-1.5 pl-3 text-right font-medium">Written</th>
                <th className="py-1.5 pl-3 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.purpose} className="border-t border-border">
                  <td className="py-2 pr-3 text-foreground">{purposeLabel(r.purpose)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">{r.calls}</td>
                  <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">{fmt(r.input)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">{fmt(r.output)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums text-foreground">{total ? Math.round(((r.input + r.output) / total) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[12px] text-subtle">Tokens are the provider's count where it gives one, otherwise about 4 characters each.</p>
        </div>
      )}
    </SettingsCard>
    </section>
  );
};

export default TokenUsageCard;
