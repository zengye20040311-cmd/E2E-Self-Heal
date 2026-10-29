import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useI18n } from "../i18n";
import type { Dict } from "../i18n/types";
import { playerScenarios, type Outcome, type PlayerScenario, type StageKey, type StepKind } from "../runs";
import { CodeBlock, lineClass, Pane, Prov } from "./ui";

const STAGES: StageKey[] = ["fail", "prep", "diag", "patch", "verify", "run", "end"];
const AUTO_MS = 1700;

type Shown = { stage: StageKey; kind: StepKind; real: boolean; log: string; note?: string };

/** The two real opening steps (failure, preprocessing), then the scenario's engine run. */
function stepsFor(s: PlayerScenario, t: Dict): Shown[] {
  const dom = s.pre.dom.length ? JSON.stringify(s.pre.dom, null, 2) : "[]";
  return [
    { stage: "fail", kind: "fail", real: true, log: s.failure },
    {
      stage: "prep",
      kind: "log",
      real: true,
      log: `error_log → ${s.pre.error}\n\n${t.demo.domChanges(s.pre.dom.length)}\n${dom}`,
    },
    ...s.steps.map((step) => ({ ...step, real: !!s.observed, note: step.note && t.notes[step.note] })),
  ];
}

const ENTRY_BORDER: Partial<Record<StepKind, string>> = {
  fail: "border-broken",
  healed: "border-healed",
  refused: "border-warn",
};

export function Player() {
  const { t, labels } = useI18n();
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState(-1);
  const [auto, setAuto] = useState(false);
  const consoleRef = useRef<HTMLDivElement>(null);

  const scenario = playerScenarios[idx];
  const text = t.scenarios[scenario.name];
  const steps = useMemo(() => stepsFor(scenario, t), [scenario, t]);
  const last = steps.length - 1;
  const current = steps[step];
  const seen = new Set(steps.slice(0, step + 1).map((s) => s.stage));

  const next = useCallback(() => setStep((s) => Math.min(s + 1, last)), [last]);
  const prev = useCallback(() => setStep((s) => Math.max(s - 1, -1)), []);

  useEffect(() => {
    if (!auto) return;
    if (step >= last) {
      setAuto(false);
      return;
    }
    const timer = setTimeout(next, step < 0 ? 0 : AUTO_MS);
    return () => clearTimeout(timer);
  }, [auto, step, last, next]);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
  }, [step, idx]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setAuto(false);
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setAuto(false);
        prev();
      } else if (e.key === " " && target.tagName !== "BUTTON") {
        e.preventDefault();
        toggleAuto();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function select(i: number) {
    setAuto(false);
    setIdx(i);
    setStep(-1);
  }

  function toggleAuto() {
    if (auto) return setAuto(false);
    if (step >= last) setStep(-1);
    setAuto(true);
  }

  return (
    <div className="grid items-start gap-6 min-[861px]:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
      <div
        className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2 min-[861px]:grid-cols-1"
        role="group"
        aria-label={t.demo.scenariosLabel}
      >
        {playerScenarios.map((s, i) => (
          <button
            key={s.name}
            type="button"
            aria-pressed={i === idx}
            onClick={() => select(i)}
            className="grid w-full cursor-pointer gap-1 rounded-lg border border-line bg-surface p-3 text-left transition-colors hover:border-muted aria-pressed:border-accent aria-pressed:bg-raised"
          >
            <span className="text-[0.95rem] font-semibold">{t.scenarios[s.name].title}</span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[0.72rem] text-muted">{labels.classes[s.class] ?? s.class}</span>
              <ExpectedChip outcome={s.expected} />
            </span>
          </button>
        ))}
      </div>

      <div className="grid min-w-0 gap-4">
        <div className="grid gap-1">
          <h3 className="text-xl font-semibold">
            {text.title} · {scenario.name}
          </h3>
          <p className="text-muted">{text.summary}</p>
        </div>

        <ol className="m-0 flex list-none flex-wrap gap-1 p-0" aria-label={t.demo.pipelineLabel}>
          {STAGES.map((key) => {
            const now = current?.stage === key;
            const nowColor =
              current?.kind === "fail"
                ? "border-broken bg-broken"
                : current?.kind === "refused"
                  ? "border-warn bg-warn"
                  : "border-accent bg-accent";
            return (
              <li
                key={key}
                className={`rounded-full border px-3 py-1 text-[0.8rem] whitespace-nowrap transition-all ${
                  now ? `${nowColor} font-semibold text-bg` : seen.has(key) ? "border-muted text-fg" : "border-line text-muted"
                }`}
              >
                {t.demo.stages[key]}
              </li>
            );
          })}
        </ol>

        <div className="grid gap-3 min-[701px]:grid-cols-2">
          <Pane title={`scenarios/${scenario.name}/spec.ts`} badge={<Prov real />}>
            <CodeBlock
              text={scenario.spec}
              classFor={(line) => {
                if (line.trim().startsWith("//")) return "text-muted";
                return line.includes(scenario.failing) ? "bg-broken/12 shadow-[inset_3px_0_0_var(--broken)]" : "";
              }}
            />
          </Pane>
          <Pane title={`change.patch → ${scenario.patchFile.replace("examples/", "")}`} badge={<Prov real />}>
            <CodeBlock text={scenario.patch} classFor={lineClass} />
          </Pane>
        </div>

        <div
          ref={consoleRef}
          aria-live="polite"
          className="grid max-h-[30rem] min-h-60 content-start gap-3 overflow-y-auto rounded-lg border border-line bg-code p-3"
        >
          {step < 0 ? (
            <p className="self-center justify-self-center px-2 py-8 text-center text-[0.9rem] text-muted [&_b]:text-fg">{t.demo.idle}</p>
          ) : (
            <>
              {steps.slice(0, step + 1).map((s, i) => (
                <div key={`${idx}-${i}`} className="grid animate-rise gap-1">
                  <div className="flex flex-wrap items-center gap-2 text-[0.78rem] text-muted">
                    <span className="font-mono font-semibold text-accent">{t.demo.stages[s.stage]}</span>
                    <Prov real={s.real} />
                  </div>
                  <div className={`grid gap-1 border-l-2 pl-3 ${ENTRY_BORDER[s.kind] ?? "border-line"}`}>
                    <pre className="m-0 font-mono text-[0.8rem] break-words whitespace-pre-wrap text-fg">
                      {s.kind === "diff"
                        ? s.log.split("\n").map((line, j) => (
                            <span
                              key={j}
                              className={`block ${line.startsWith("+") ? "text-healed" : line.startsWith("-") ? "text-broken" : ""}`}
                            >
                              {line}
                            </span>
                          ))
                        : s.log}
                    </pre>
                    {s.note && <p className="text-[0.85rem] text-muted">{s.note}</p>}
                  </div>
                </div>
              ))}
              {step === last && <Result scenario={scenario} />}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Btn onClick={() => select(idx)}>{t.demo.controls.reset}</Btn>
          <Btn disabled={step < 0} onClick={() => (setAuto(false), prev())}>
            {t.demo.controls.prev}
          </Btn>
          <Btn primary disabled={step >= last} onClick={() => (setAuto(false), next())}>
            {step < 0 ? t.demo.controls.run : t.demo.controls.next}
          </Btn>
          <Btn pressed={auto} onClick={toggleAuto}>
            {auto ? t.demo.controls.pause : t.demo.controls.auto}
          </Btn>
          <span className="ml-auto text-[0.78rem] text-muted">
            <Kbd>←</Kbd> <Kbd>→</Kbd> {t.demo.controls.step} · <Kbd>{labels.space}</Kbd> {t.demo.controls.auto}
          </span>
        </div>
      </div>
    </div>
  );
}

function Result({ scenario: s }: { scenario: PlayerScenario }) {
  const { t, labels } = useI18n();
  const text = t.scenarios[s.name];
  if (s.outcome === "repair") {
    return (
      <div className="grid gap-2 rounded-lg border border-healed bg-healed/12 p-4">
        <div className="flex flex-wrap items-center gap-2 text-[1.05rem] font-bold text-healed">
          {t.demo.healedTitle} <Tag>{labels.exitCode(0)}</Tag>
          <Tag>{labels.healed}</Tag>
        </div>
        <p className="text-[0.92rem]">{text.why}</p>
        <p className="text-[0.85rem] text-muted">{t.demo.healedNote}</p>
      </div>
    );
  }
  const verdict = s.outcome === s.expected ? t.demo.correctRefusal : t.demo.incorrectRefusal;
  return (
    <div className="grid gap-2 rounded-lg border border-warn bg-warn/12 p-4">
      <div className="flex flex-wrap items-center gap-2 text-[1.05rem] font-bold text-warn">
        {t.demo.refusedTitle} · {verdict} <Tag>{labels.exitCode(1)}</Tag>
        {s.reason && <Tag>{t.demo.reasons[s.reason]}</Tag>}
      </div>
      <p className="text-[0.92rem]">
        {s.reason && `${t.demo.reasons[s.reason]}: `}
        {text.why}
      </p>
      {text.trap && (
        <p className="text-[0.85rem] text-muted">
          <b className="text-fg">{t.demo.trapLabel}</b> {text.trap} <Prov real />
        </p>
      )}
      {text.gap && (
        <p className="text-[0.85rem] text-muted">
          <b className="text-fg">{t.demo.gapLabel}</b> {text.gap}
        </p>
      )}
    </div>
  );
}

function ExpectedChip({ outcome }: { outcome: Outcome }) {
  const { t } = useI18n();
  return outcome === "repair" ? (
    <span className="rounded bg-healed/12 px-1.5 font-mono text-[0.72rem] text-healed">{t.demo.expected.repair}</span>
  ) : (
    <span className="rounded bg-warn/13 px-1.5 font-mono text-[0.72rem] text-warn">{t.demo.expected.refuse}</span>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded border border-current px-2 font-mono text-[0.75rem] font-semibold">{children}</span>;
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line px-1.5 font-mono text-[0.72rem]">{children}</kbd>;
}

function Btn({
  children,
  onClick,
  disabled,
  primary,
  pressed,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={`cursor-pointer rounded-lg border px-4 py-2 text-[0.9rem] transition-colors disabled:cursor-default disabled:opacity-45 ${
        primary ? "border-accent bg-accent font-semibold text-bg" : "border-line bg-surface text-fg enabled:hover:border-muted"
      }`}
    >
      {children}
    </button>
  );
}
