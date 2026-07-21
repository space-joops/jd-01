import Link from "next/link";
import BaseHub from "./components/base-hub";
import DoodleSky from "./components/doodle-sky";

const RULES = [
  { color: "#8ecbff", text: "눌러 끌면 분사" },
  { color: "#7ee8b2", text: "잔해 주워 kg" },
  { color: "#66fcf1", text: "연료 셀로 재점화" },
  { color: "#ffce59", text: "⚠ 경고물은 연료 -" },
];

export default function Home() {
  return (
    <div className="relative flex min-h-full flex-col bg-[#141838] text-zinc-100 select-none">
      {/* 배경 어트랙트 — 스크롤과 무관하게 뷰포트에 고정 */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <DoodleSky />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 py-3 text-base text-zinc-500">
        <span>🛰️ 궤도 청소 대작전 · 기지</span>
        <span className="hidden sm:inline">2061년 · 지구 저궤도</span>
      </header>

      <main className="relative z-10 flex-1 pb-10">
        {/* 히어로 */}
        <section
          className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 pb-8 pt-4 text-center"
          style={{ textShadow: "0 2px 10px rgba(10,12,30,0.95)" }}
        >
          <p className="-rotate-3 text-xl text-[#8ecbff]">SPACE JOOPS · 조종 에디션</p>
          <h1
            className="-rotate-2 text-6xl font-bold leading-none text-[#7ee8b2] sm:text-7xl"
            style={{ textShadow: "0 4px 0 rgba(0,0,0,.45)" }}
          >
            우주 냠냠!
          </h1>
          <p className="mt-1 text-lg leading-7 text-zinc-200">
            궤도에 떠다니는 <span className="text-[#ffd166]">8,000톤</span>짜리 쓰레기 구름.
            <br />
            조그셔틀을 조종해 전부 수거하러 갑니다.
          </p>
          <ul className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-base text-zinc-300">
            {RULES.map((r) => (
              <li key={r.text} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: r.color }}
                />
                {r.text}
              </li>
            ))}
          </ul>
          <Link
            href="/play"
            className="doodle-box animate-wiggle mt-3 inline-flex items-center gap-2 border-[3px] border-[#7ee8b2] bg-[#7ee8b2]/15 px-9 py-2 text-3xl font-bold text-[#7ee8b2] transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7ee8b2]"
          >
            <span aria-hidden="true">▶</span> 출격!
          </Link>
        </section>

        {/* 기지 대시보드 — 인벤토리 · 진화 · 완전체 모습 */}
        <BaseHub />
      </main>

      <footer className="relative z-10 flex items-center justify-between px-5 py-3 text-sm text-zinc-600">
        <span>v0.1.0 · 손으로 그린 우주</span>
        <span className="hidden sm:inline">눌러 끌면 날아가요</span>
      </footer>
    </div>
  );
}
