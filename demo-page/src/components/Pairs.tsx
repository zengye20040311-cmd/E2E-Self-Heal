import { useI18n } from "../i18n";
import { scenarioData } from "../runs";
import { CodeBlock, lineClass, Pane } from "./ui";

function Verdict({ repair, children }: { repair: boolean; children: string }) {
  return <span className={`font-semibold ${repair ? "text-healed" : "text-warn"}`}>{children}</span>;
}

export function Pairs() {
  const { t, labels } = useI18n();
  const { sameError, sameDiff } = t.pairs;
  const d = scenarioData;
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <p className="font-semibold">
          {sameError.question} <span className="font-normal text-muted">· {sameError.source}</span>{" "}
          <span className="font-mono text-[0.75rem] text-accent">{labels.identical}</span>
        </p>
        <div className="grid gap-3 min-[761px]:grid-cols-2">
          <Pane title="delayed-cta" badge={<Verdict repair>{sameError.repair}</Verdict>}>
            <CodeBlock text={d["delayed-cta"].failure} />
          </Pane>
          <Pane title="cta-rename-handler-dropped" badge={<Verdict repair={false}>{sameError.refuse}</Verdict>}>
            <CodeBlock text={d["cta-rename-handler-dropped"].failure} />
          </Pane>
        </div>
        <p className="max-w-[75ch] text-[0.95rem] text-muted [&_b]:text-fg">{sameError.answer}</p>
      </div>

      <div className="grid gap-3">
        <p className="font-semibold">
          {sameDiff.question} <span className="font-normal text-muted">· {sameDiff.source}</span>
        </p>
        <div className="grid gap-3 min-[761px]:grid-cols-2">
          <Pane title="id-rename" badge={<Verdict repair>{sameDiff.repair}</Verdict>}>
            <CodeBlock text={d["id-rename"].patch} classFor={lineClass} />
          </Pane>
          <Pane title="id-rename-submit-dropped" badge={<Verdict repair={false}>{sameDiff.refuse}</Verdict>}>
            <CodeBlock text={d["id-rename-submit-dropped"].patch} classFor={lineClass} />
          </Pane>
        </div>
        <p className="max-w-[75ch] text-[0.95rem] text-muted [&_b]:text-fg">{sameDiff.answer}</p>
      </div>
    </div>
  );
}
