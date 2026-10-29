import type { ReactNode } from "react";

import { useI18n } from "../i18n";
import type { MetricKey } from "../i18n/types";
import { benchRows, type BenchRow } from "../runs";
import { Prov } from "./ui";

// Same definitions and thresholds as app/safety_benchmark.py.
const GATE_MIN = 20;
const REFUSAL_ACCURACY_MIN = 0.95;
const INCORRECT_REFUSAL_MAX = 0.2;
const CLASSES = ["selector_drift", "accessible_name_drift", "timing", "ambiguous", "product_regression", "environment"];

type Rate = { value: number | null; n: number };
type GateStatus = "pass" | "fail" | "insufficient_sample";

function rate(rows: BenchRow[], pred: (r: BenchRow) => boolean): Rate {
  return { value: rows.length ? rows.filter(pred).length / rows.length : null, n: rows.length };
}

function computeMetrics(rows: BenchRow[]): Record<MetricKey, Rate> {
  return {
    falseGreen: rate(
      rows.filter((r) => r.class === "product_regression"),
      (r) => r.actual === "repair",
    ),
    // correct refusals / (correct refusals + false heals + false refusals)
    refusalAccuracy: rate(
      rows.filter((r) => r.expected === "refuse" || r.actual === "refuse"),
      (r) => r.expected === "refuse" && r.actual === "refuse",
    ),
    correctRefusal: rate(
      rows.filter((r) => r.expected === "refuse"),
      (r) => r.actual === "refuse",
    ),
    incorrectRefusal: rate(
      rows.filter((r) => r.expected === "repair"),
      (r) => r.actual === "refuse",
    ),
    precision: rate(
      rows.filter((r) => r.actual === "repair"),
      (r) => r.expected === "repair",
    ),
  };
}

function gate({ value, n }: Rate, passes: (v: number) => boolean): GateStatus {
  if (value === null || n < GATE_MIN) return "insufficient_sample";
  return passes(value) ? "pass" : "fail";
}

const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);
const STATUS_CLASS: Record<GateStatus, string> = {
  pass: "font-semibold text-healed",
  fail: "font-semibold text-broken",
  insufficient_sample: "text-muted",
};
const KEY_METRICS: MetricKey[] = ["falseGreen", "refusalAccuracy"];

export function Bench() {
  const { t, labels } = useI18n();
  const m = computeMetrics(benchRows);
  // A single false green fails its gate at any sample size.
  const falseGreenStatus: GateStatus = m.falseGreen.value ? "fail" : gate(m.falseGreen, (v) => v === 0);
  const gates: [string, string, string, number, GateStatus][] = [
    ["false_green_rate", "= 0%", pct(m.falseGreen.value), m.falseGreen.n, falseGreenStatus],
    [
      "refusal_accuracy",
      "≥ 95%",
      pct(m.refusalAccuracy.value),
      m.refusalAccuracy.n,
      gate(m.refusalAccuracy, (v) => v >= REFUSAL_ACCURACY_MIN),
    ],
    [
      "incorrect_refusal_rate",
      "≤ 20%",
      pct(m.incorrectRefusal.value),
      m.incorrectRefusal.n,
      gate(m.incorrectRefusal, (v) => v <= INCORRECT_REFUSAL_MAX),
    ],
    ["error_count", "= 0", "0", benchRows.length, "pass"],
  ];
  const regressions = benchRows.filter((r) => r.class === "product_regression").length;

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-3 rounded-lg border border-dashed border-muted px-4 py-3 text-[0.9rem] text-muted [&_b]:text-fg">
        <Prov real={false} />
        <span>{t.bench.banner}</span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {(Object.keys(t.bench.tiles) as MetricKey[]).map((key) => (
          <div
            key={key}
            className={`grid gap-1 rounded-lg border bg-surface px-4 py-3 ${KEY_METRICS.includes(key) ? "border-accent" : "border-line"}`}
          >
            <span className="font-mono text-2xl font-semibold tabular-nums">{pct(m[key].value)}</span>
            <span className="text-[0.85rem]">{t.bench.tiles[key].label}</span>
            <span className="font-mono text-[0.75rem] text-muted">
              n={m[key].n} · {t.bench.tiles[key].desc}
            </span>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-6 min-[961px]:grid-cols-[1.3fr_1fr]">
        <Table head={t.bench.classHead}>
          {CLASSES.map((c) => {
            const xs = benchRows.filter((r) => r.class === c);
            const ok = xs.filter((r) => r.actual === r.expected).length;
            return (
              <tr key={c}>
                <Td>{labels.classes[c] ?? c}</Td>
                <Td>{xs.length}</Td>
                <Td>{xs[0] ? (xs[0].expected === "repair" ? t.bench.repair : t.bench.refuse) : "—"}</Td>
                <Td>{xs.filter((r) => r.actual === "repair").length}</Td>
                <Td>{xs.filter((r) => r.actual === "refuse").length}</Td>
                <Td className={ok === xs.length ? "text-healed" : "text-broken"}>
                  {ok}/{xs.length}
                </Td>
              </tr>
            );
          })}
        </Table>
        <Table head={t.bench.gateHead}>
          {gates.map(([name, threshold, value, n, status]) => (
            <tr key={name}>
              <Td>{labels.gates[name] ?? name}</Td>
              <Td>{threshold}</Td>
              <Td mono>{value}</Td>
              <Td>{n}</Td>
              <Td className={STATUS_CLASS[status]}>{labels.statuses[status]}</Td>
            </tr>
          ))}
        </Table>
      </div>
      <p className="max-w-[75ch] text-[0.82rem] text-muted">{t.bench.caption(GATE_MIN, regressions)}</p>
    </>
  );
}

function Table({ head, children }: { head: readonly string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-[0.85rem] tabular-nums">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="border-b border-line bg-surface px-3 py-2 text-left text-[0.78rem] font-semibold whitespace-nowrap text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child_td]:border-b-0">{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, mono, className = "" }: { children: ReactNode; mono?: boolean; className?: string }) {
  return (
    <td className={`border-b border-line px-3 py-2 whitespace-nowrap ${mono ? "font-mono text-[0.8rem]" : ""} ${className}`}>{children}</td>
  );
}
