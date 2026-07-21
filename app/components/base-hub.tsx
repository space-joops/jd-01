"use client";

import { useSyncExternalStore } from "react";
import {
  COLLECT_KINDS,
  type CollectKind,
  EVOLVE_AT,
  type Progress,
  serverSnapshot,
  setSkin,
  snapshotProgress,
  subscribeProgress,
} from "../lib/progress";
import {
  FUEL_SRC,
  FX,
  SKIN_LABEL,
  type Stage,
  STAGE3_SKINS,
  debrisSrc,
  petSrc,
} from "../lib/pilot-sprites";

const KIND_ICON: Record<CollectKind, string> = {
  chip: debrisSrc("chip"),
  bolt: debrisSrc("bolt"),
  tank: debrisSrc("solar_fragment"),
  fuel: FUEL_SRC,
  hazard: FX.alert,
};
const KIND_LABEL: Record<CollectKind, string> = {
  chip: "칩",
  bolt: "볼트",
  tank: "대형",
  fuel: "연료셀",
  hazard: "경고물",
};

const STAGES: Stage[] = [1, 2, 3];
const STAGE_LABEL: Record<Stage, string> = { 1: "아기", 2: "청소년", 3: "완전체" };
/** stage 도달에 필요한 kg (1단계=0, 2단계=EVOLVE_AT[0], 3단계=EVOLVE_AT[1]) */
const stageThreshold = (s: Stage) => (s === 1 ? 0 : EVOLVE_AT[s - 2]);

const Icon = (props: { src: string; className?: string }) => (
  // eslint-disable-next-line @next/next/no-img-element -- 캔버스 밖 정적 SVG 아이콘
  <img src={props.src} alt="" aria-hidden className={props.className} />
);

export default function BaseHub() {
  const raw = useSyncExternalStore(subscribeProgress, snapshotProgress, serverSnapshot);
  const p: Progress = JSON.parse(raw);
  const seen = new Set(p.kinds);

  const nextStage = Math.min(3, p.stageMax + 1) as Stage;
  const remaining = p.stageMax >= 3 ? 0 : Math.max(0, stageThreshold(nextStage) - p.best);

  return (
    <div className="mx-auto w-full max-w-md space-y-4 px-6 pb-16 text-left">
      {/* 인벤토리 */}
      <section className="doodle-box border-[3px] border-[#8ecbff]/45 bg-[#0e1330]/80 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-[#8ecbff]">🛰️ 인벤토리</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "누적 수거", value: `${p.totalKg.toLocaleString()}`, unit: "kg", color: "#7ee8b2" },
            { label: "최고 기록", value: `${p.best.toLocaleString()}`, unit: "kg", color: "#ffd166" },
            { label: "출격", value: `${p.plays.toLocaleString()}`, unit: "회", color: "#8ecbff" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-white/5 py-2">
              <div className="text-2xl font-bold leading-none" style={{ color: s.color }}>
                {s.value}
                <span className="ml-0.5 text-sm text-zinc-400">{s.unit}</span>
              </div>
              <div className="mt-1 text-sm text-zinc-400">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <div className="mb-1.5 text-sm text-zinc-400">수집 도감</div>
          <div className="flex flex-wrap gap-2">
            {COLLECT_KINDS.map((k) => {
              const got = seen.has(k);
              return (
                <div
                  key={k}
                  title={KIND_LABEL[k]}
                  className={`flex w-14 flex-col items-center gap-0.5 rounded-lg border-2 py-1.5 transition ${
                    got ? "border-[#7ee8b2]/50 bg-[#7ee8b2]/10" : "border-white/10 bg-black/20"
                  }`}
                >
                  <Icon src={KIND_ICON[k]} className={`h-8 w-8 ${got ? "" : "opacity-25 grayscale"}`} />
                  <span className={`text-xs ${got ? "text-zinc-200" : "text-zinc-500"}`}>
                    {KIND_LABEL[k]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 진화 */}
      <section className="doodle-box border-[3px] border-[#7ee8b2]/45 bg-[#0e1330]/80 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-[#7ee8b2]">🧬 진화</h2>
        <div className="flex items-stretch justify-between gap-2">
          {STAGES.map((s) => {
            const reached = p.stageMax >= s;
            return (
              <div
                key={s}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl border-2 py-2 transition ${
                  reached ? "border-[#7ee8b2]/50 bg-[#7ee8b2]/10" : "border-white/10 bg-black/20"
                }`}
              >
                <Icon
                  src={petSrc(s, "happy", p.skin)}
                  className={`h-12 w-12 ${reached ? "" : "opacity-30 grayscale"}`}
                />
                <span className={`text-sm font-bold ${reached ? "text-zinc-100" : "text-zinc-500"}`}>
                  {s}단계
                </span>
                <span className="text-xs text-zinc-500">
                  {reached ? STAGE_LABEL[s] : `${stageThreshold(s)}kg`}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-sm text-zinc-300">
          {p.stageMax >= 3 ? (
            <span className="text-[#ffd166]">최종 진화 달성! 🎉</span>
          ) : (
            <>
              다음 진화까지 <span className="font-bold text-[#ffd166]">{remaining}kg</span>
              <span className="text-zinc-500"> (한 판에 {stageThreshold(nextStage)}kg 도달)</span>
            </>
          )}
        </p>
      </section>

      {/* 스킨 */}
      <section className="doodle-box border-[3px] border-[#ffd166]/45 bg-[#0e1330]/80 p-4">
        <h2 className="mb-1 text-xl font-bold text-[#ffd166]">완전체 모습</h2>
        <p className="mb-3 text-sm text-zinc-400">3단계 진화 시 나타날 모습을 골라요</p>
        <div className="flex items-center justify-between gap-2">
          {STAGE3_SKINS.map((s) => {
            const active = p.skin === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSkin(s)}
                aria-pressed={active}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl border-2 py-2 transition ${
                  active ? "border-[#ffd166] bg-[#ffd166]/15" : "border-white/15 hover:border-white/30"
                }`}
              >
                <Icon src={petSrc(3, "happy", s)} className="h-11 w-11" />
                <span className={`text-sm font-bold ${active ? "text-[#ffd166]" : "text-zinc-300"}`}>
                  {SKIN_LABEL[s]}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
