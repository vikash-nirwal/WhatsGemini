import React, { useEffect, useState } from "react";
import { SettingsCard, SettingsCardHeader, SettingsRow } from "src/components/molecules/settings-card";
import { SegmentedControl } from "src/components/molecules/SegmentedControl";
import { Input } from "src/components/atoms/input";
import { Button } from "src/components/atoms/button";
import { CHAT_PROVIDER_META, IMAGE_PROVIDER_META, VIDEO_PROVIDER_META } from "../../features/ai/providers/registry";
import {
  BudgetMode,
  formatUSD,
  isOverLimit,
  lastMonths,
  monthKey,
  monthLabel,
  monthTotal,
  providerBreakdown,
  ProviderSpend,
  setBudget,
  SpendKind,
  useSpending,
  WARN_FRACTION,
} from "../../features/spending/spending";
import { cn } from "../../utils/cn";

// How many months the history card shows, this one included.
const HISTORY_MONTHS = 6;

const MODE_OPTIONS = [
  { value: "warn", label: "Warn me" },
  { value: "block", label: "Stop paid calls" },
];

const KIND_LABELS: Record<SpendKind, string> = { text: "text", image: "images", video: "video" };

// One name per provider id, whichever list it's in. The chat list wins, so
// OpenAI's images and replies share one plain "OpenAI" row.
const PROVIDER_LABELS: Record<string, string> = Object.fromEntries(
  [...VIDEO_PROVIDER_META, ...IMAGE_PROVIDER_META, ...CHAT_PROVIDER_META].map((p) => [p.id, p.label])
);
const providerLabel = (id: string) => PROVIDER_LABELS[id] || id;

const kindSummary = (spend: ProviderSpend) => {
  const kinds = Object.entries(spend.byKind || {}).filter(([, cost]) => (cost || 0) > 0) as [SpendKind, number][];
  // Only worth spelling out when the money went on more than one kind.
  if (kinds.length < 2) return "";
  return kinds.map(([kind, cost]) => `${KIND_LABELS[kind]} ${formatUSD(cost)}`).join(", ");
};

const MeterBar: React.FC<{ fraction: number; over?: boolean; label: string; className?: string }> = ({ fraction, over, label, className }) => (
  <div
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(Math.min(fraction, 1) * 100)}
    className={cn("h-2 rounded-full bg-muted overflow-hidden", className)}
  >
    <div
      className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")}
      style={{ width: `${Math.min(fraction, 1) * 100}%` }}
    />
  </div>
);

// Settings, Spending (#42): what paid calls cost this month and before, and
// the optional monthly limit. Reads the spending store directly, so it
// updates live while a reply is being paid for in another view.
const SpendingSettings: React.FC = () => {
  const { ledger, budget } = useSpending();
  const month = monthKey();
  const spent = monthTotal(ledger, month);
  const breakdown = providerBreakdown(ledger, month);
  const history = lastMonths(HISTORY_MONTHS).map((m) => ({ month: m, total: monthTotal(ledger, m) }));
  const historyMax = Math.max(...history.map((h) => h.total), 0);
  const hasLimit = budget.monthlyLimit > 0;
  const over = isOverLimit(spent, budget);
  const fraction = hasLimit ? spent / budget.monthlyLimit : 0;

  // The field keeps its own text while typing ("1." on the way to "1.50");
  // the budget only changes when it parses to a valid amount.
  const [limitText, setLimitText] = useState(hasLimit ? String(budget.monthlyLimit) : "");
  useEffect(() => {
    setLimitText((text) => (Number(text || 0) === budget.monthlyLimit ? text : budget.monthlyLimit > 0 ? String(budget.monthlyLimit) : ""));
  }, [budget.monthlyLimit]);

  const handleLimitChange = (text: string) => {
    setLimitText(text);
    const value = text.trim() === "" ? 0 : Number(text);
    if (Number.isFinite(value) && value >= 0) setBudget({ ...budget, monthlyLimit: Math.round(value * 100) / 100 });
  };

  const raiseBy = (amount: number) => setBudget({ ...budget, monthlyLimit: Math.ceil(Math.max(budget.monthlyLimit, spent) + amount) });

  let status: string;
  if (!hasLimit) status = "No monthly limit set.";
  else if (over && budget.mode === "block") status = "Limit reached: paid calls are paused until next month or until you raise the limit.";
  else if (over) status = "Limit reached. Paid calls still work because the limit only warns.";
  else if (fraction >= WARN_FRACTION) status = `Over ${Math.round(WARN_FRACTION * 100)}% of the limit.`;
  else status = `${formatUSD(budget.monthlyLimit - spent)} left this month.`;

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard>
        <div className="p-5 flex flex-col gap-4">
          <SettingsCardHeader title={`This month (${monthLabel(month)})`} hint="Estimates, not your provider's bill" />
          <div className="flex items-baseline gap-2 flex-wrap">
            <span data-testid="spending-month-total" className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {formatUSD(spent)}
            </span>
            {hasLimit && <span className="text-sm text-muted-foreground">of {formatUSD(budget.monthlyLimit)} limit</span>}
          </div>
          {hasLimit && <MeterBar fraction={fraction} over={over} label="Monthly limit used" />}
          <p className="text-[13px] text-muted-foreground flex items-center gap-2">
            {over && <span aria-hidden className="w-2 h-2 rounded-full bg-destructive flex-none" />}
            <span>{status}</span>
          </p>
        </div>
        {breakdown.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">No paid calls yet this month.</p>
        ) : (
          <ul aria-label="Spending by provider this month" className="divide-y divide-border/40">
            {breakdown.map((p) => {
              const kinds = kindSummary(p);
              return (
                <li key={p.providerId} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{providerLabel(p.providerId)}</div>
                    <div className="text-xs text-subtle">
                      {p.calls} {p.calls === 1 ? "call" : "calls"}
                      {kinds && ` · ${kinds}`}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-foreground tabular-nums">{formatUSD(p.cost)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard>
        <div className="p-5 pb-4">
          <SettingsCardHeader title="Last few months" />
        </div>
        <ul aria-label="Spending by month" className="px-5 pt-4 pb-5 flex flex-col gap-3">
          {history.map((h) => (
            <li key={h.month} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_4.5rem] items-center gap-3">
              <span className="text-sm text-foreground truncate">{monthLabel(h.month, "short")}</span>
              <div aria-hidden className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: historyMax > 0 ? `${(h.total / historyMax) * 100}%` : "0%" }} />
              </div>
              <span className="text-sm text-foreground tabular-nums text-right">{formatUSD(h.total)}</span>
            </li>
          ))}
        </ul>
      </SettingsCard>

      <SettingsCard>
        <div className="p-5">
          <SettingsCardHeader
            title="Monthly limit"
            hint="You get a warning at 80%. Local providers (Ollama, SD WebUI, ComfyUI) are free and never blocked."
          />
        </div>
        <SettingsRow label="Limit (USD)" hint="Leave empty for no limit." align="start">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              value={limitText}
              onChange={(e) => handleLimitChange(e.target.value)}
              placeholder="No limit"
              aria-label="Monthly limit in US dollars"
              className="w-32"
            />
            {over && (
              <Button type="button" variant="outline" onClick={() => raiseBy(5)}>
                Raise by $5
              </Button>
            )}
          </div>
        </SettingsRow>
        <SettingsRow label="At 100%" hint="A warning, or a hard stop that blocks new paid calls until you raise the limit." align="start">
          <SegmentedControl
            value={budget.mode}
            onChange={(v) => setBudget({ ...budget, mode: v as BudgetMode })}
            options={MODE_OPTIONS}
          />
        </SettingsRow>
      </SettingsCard>

      <p className="text-xs text-subtle leading-relaxed px-1">
        Costs are estimated in this browser from token counts and list prices, or a flat price per picture or video
        where the provider reports no usage. Your provider's bill is the real number. Spending is saved with your
        settings and full backups.
      </p>
    </div>
  );
};

export default SpendingSettings;
