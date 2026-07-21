// ============================================================================
// progress — 기지(허브)가 읽는 게임-세계 진행 데이터 (localStorage 단일 소스)
//
// 게임(joops-game)은 게임오버 때 recordRun()으로 누적 통계를 남기고, 메인 화면의
// BaseHub 는 useSyncExternalStore 로 이를 SSR 안전하게 읽어 인벤토리·진화를 그린다.
// 같은 탭에서는 storage 이벤트가 안 뜨므로, 쓰기 후 커스텀 이벤트로 직접 알린다.
// ============================================================================

import { BEST_KEY } from "./doodle-art";
import { SKIN_KEY, STAGE3_SKINS, type Stage3Skin } from "./pilot-sprites";

export const TOTAL_KG_KEY = "sjs-total-kg";
export const PLAYS_KEY = "sjs-plays";
export const STAGE_MAX_KEY = "sjs-stage-max";
export const KINDS_KEY = "sjs-kinds";

/** 진화 kg 임계 [2단계, 3단계] — 게임과 허브가 공유하는 단일 소스 */
export const EVOLVE_AT = [45, 110];

/** 인벤토리 도감에 나열하는 잔해 종류(만난 적 있으면 밝게 표시) */
export type CollectKind = "chip" | "bolt" | "tank" | "fuel" | "hazard";
export const COLLECT_KINDS: CollectKind[] = ["chip", "bolt", "tank", "fuel", "hazard"];

const PROGRESS_EVENT = "sjs-progress";

export type Progress = {
  best: number; // 최고 기록(kg)
  totalKg: number; // 누적 수거량(kg)
  plays: number; // 출격 횟수
  stageMax: number; // 최고 도달 진화 단계
  kinds: CollectKind[]; // 만난 잔해 종류
  skin: Stage3Skin; // 선택한 3단계 스킨
};

const num = (raw: string | null) => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

function notify() {
  try {
    window.dispatchEvent(new Event(PROGRESS_EVENT));
  } catch {}
}

/** 한 판 결과를 누적 반영한다. (게임오버 시 호출) */
export function recordRun(run: { kg: number; stage: number; kinds: CollectKind[] }) {
  try {
    const kg = Math.max(0, Math.round(run.kg));
    if (kg > num(localStorage.getItem(BEST_KEY))) localStorage.setItem(BEST_KEY, String(kg));
    localStorage.setItem(TOTAL_KG_KEY, String(num(localStorage.getItem(TOTAL_KG_KEY)) + kg));
    localStorage.setItem(PLAYS_KEY, String(num(localStorage.getItem(PLAYS_KEY)) + 1));
    if (run.stage > num(localStorage.getItem(STAGE_MAX_KEY)))
      localStorage.setItem(STAGE_MAX_KEY, String(run.stage));
    const seen = new Set(readKinds());
    run.kinds.forEach((k) => seen.add(k));
    localStorage.setItem(KINDS_KEY, [...seen].join(","));
  } catch {}
  notify();
}

function readKinds(): CollectKind[] {
  try {
    const raw = localStorage.getItem(KINDS_KEY) ?? "";
    return raw
      .split(",")
      .filter((k): k is CollectKind => (COLLECT_KINDS as string[]).includes(k));
  } catch {
    return [];
  }
}

export function getSkin(): Stage3Skin {
  try {
    const s = localStorage.getItem(SKIN_KEY) as Stage3Skin | null;
    if (s && STAGE3_SKINS.includes(s)) return s;
  } catch {}
  return "magnet";
}

export function setSkin(s: Stage3Skin) {
  try {
    localStorage.setItem(SKIN_KEY, s);
  } catch {}
  notify();
}

// ---- SSR 안전 외부 스토어 (useSyncExternalStore 용) -------------------------

export function subscribeProgress(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(PROGRESS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PROGRESS_EVENT, onChange);
  };
}

/** 내용이 같으면 동일 문자열(===)이라 리렌더 루프가 없다. 컴포넌트에서 파싱해 쓴다. */
export function snapshotProgress(): string {
  const p: Progress = {
    best: num(localStorage.getItem(BEST_KEY)),
    totalKg: num(localStorage.getItem(TOTAL_KG_KEY)),
    plays: num(localStorage.getItem(PLAYS_KEY)),
    stageMax: Math.max(1, num(localStorage.getItem(STAGE_MAX_KEY))),
    kinds: readKinds(),
    skin: getSkin(),
  };
  return JSON.stringify(p);
}

const SERVER_SNAPSHOT = JSON.stringify({
  best: 0,
  totalKg: 0,
  plays: 0,
  stageMax: 1,
  kinds: [],
  skin: "magnet",
} satisfies Progress);

export function serverSnapshot(): string {
  return SERVER_SNAPSHOT;
}
