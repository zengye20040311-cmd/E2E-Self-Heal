import type { ReactNode } from "react";

import { Architecture } from "./components/Architecture";
import { Bench } from "./components/Bench";
import { Pairs } from "./components/Pairs";
import { Player } from "./components/Player";
import { Prov, Section } from "./components/ui";
import { LANGS, useI18n, type Lang } from "./i18n";

export function App() {
  const { t, lang, labels, setLang } = useI18n();
  const nav: [string, string][] = [
    ["#demo", t.nav.demo],
    ["#pairs", t.nav.pairs],
    ["#bench", t.nav.bench],
    ["#arch", t.nav.arch],
  ];
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-bg">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-4 py-3">
          <span className="font-mono font-semibold">
            e2e-<b className="font-semibold text-accent">healer</b>
          </span>
          <nav className="flex flex-wrap gap-4 text-[0.9rem]" aria-label={labels.sections}>
            {nav.map(([href, label]) => (
              <a key={href} href={href} className="text-muted no-underline hover:text-fg">
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="flex gap-2 max-[520px]:hidden">
              <Prov real />
              <Prov real={false} />
            </span>
            <label className="flex items-center gap-2 text-[0.8rem] text-muted">
              <span className="sr-only">{t.language}</span>
              <select
                id="lang"
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="cursor-pointer rounded-md border border-line bg-surface px-2 py-1 text-fg"
              >
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4">
        <section className="grid gap-6 pt-16 pb-12" aria-labelledby="hero-title">
          <div className="font-mono text-[0.8rem] tracking-[0.08em] text-accent uppercase">{t.hero.eyebrow}</div>
          <h1 id="hero-title" className="max-w-[22ch] text-[clamp(1.9rem,4.6vw,3.1rem)] leading-tight font-bold">
            {t.hero.title}
          </h1>
          <p className="max-w-[62ch] text-[1.05rem] text-muted">{t.hero.lede}</p>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {t.hero.facts.map(([value, label]) => (
              <div key={label} className="grid">
                <b className="font-mono text-lg font-semibold">{value}</b>
                <span className="text-[0.82rem] text-muted">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <Section id="demo" title={t.demo.title} intro={t.demo.intro}>
          <Player />
        </Section>
        <Section id="pairs" title={t.pairs.title} intro={t.pairs.intro}>
          <Pairs />
        </Section>
        <Section id="bench" title={t.bench.title} intro={t.bench.intro}>
          <Bench />
        </Section>
        <Section id="arch" title={t.arch.title} intro={t.arch.intro}>
          <Architecture />
        </Section>

        <footer className="grid gap-2 border-t border-line pt-8 pb-12 text-[0.85rem] text-muted">
          <b className="text-fg">{t.footer.title}</b>
          <ul className="m-0 grid gap-1 pl-0">
            {t.footer.sources.map(([real, body], i) => (
              <Source key={i} real={real}>
                {body}
              </Source>
            ))}
          </ul>
        </footer>
      </main>
    </>
  );
}

function Source({ real, children }: { real: boolean; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-baseline gap-2">
      <Prov real={real} />
      <span>{children}</span>
    </li>
  );
}
