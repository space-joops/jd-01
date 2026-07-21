// ============================================================================
// orbit — 아주 살짝 진짜인 궤도 시뮬레이션 (캐릭터 위성 관제용)
//
// 원형 경사궤도를 가정하고 케플러/기하로 지표 직하점(lat/lon)·속도·일조·지상국
// 앙각/거리·패스 예측을 계산한다. 외부 데이터 없이 자체 완결.
// ============================================================================

export const MU = 398600.4418; // km^3/s^2
export const RE = 6371; // km
export const ALT = 420; // km
export const A = RE + ALT; // 궤도 반경
export const PERIOD = 2 * Math.PI * Math.sqrt((A * A * A) / MU); // s (≈ 92.8분)
export const VEL = Math.sqrt(MU / A); // km/s (≈ 7.66)
export const WE = (2 * Math.PI) / 86164; // 지구 자전 각속도(rad/s, 항성일)

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
export const wrapLon = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/** 발사 기준 시각(고정) — REV 카운트와 위상의 기준 */
export const LAUNCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);

export type Sat = {
  id: string;
  name: string;
  color: string;
  inc: number; // 경사각(도)
  node0: number; // 기준 승교점 경도(도)
  u0: number; // 기준 argument of latitude(도)
};

/** 관제 대상 위성들 (SATS 2) */
export const SATS: Sat[] = [
  { id: "nyam", name: "냠냠샛", color: "#7ee8b2", inc: 53, node0: 20, u0: 0 },
  { id: "byeol", name: "별똥이", color: "#8ecbff", inc: 74, node0: 150, u0: 130 },
];

/** 지상국 (Ground Station) */
export const GS = { name: "냠냠 관제소", lat: 37.4, lon: 127.0 };

export type SatState = {
  lat: number; // 직하점 위도(도)
  lon: number; // 직하점 경도(도)
  alt: number; // km
  vel: number; // km/s
};

/** 위성의 지표 직하점 상태 (sim 초 기준) */
export function satState(sat: Sat, tSec: number): SatState {
  const n = (2 * Math.PI) / PERIOD;
  const inc = sat.inc * D2R;
  const u = n * tSec + sat.u0 * D2R; // argument of latitude
  const lat = Math.asin(Math.sin(inc) * Math.sin(u));
  const lonRel = Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u));
  const lonInertial = sat.node0 * D2R + lonRel;
  const lon = lonInertial - WE * tSec; // 지구 고정계
  return { lat: lat * R2D, lon: wrapLon(lon * R2D), alt: ALT, vel: VEL };
}

/** 한 궤도 분량의 지상궤적 점들 */
export function groundTrack(sat: Sat, tSec: number, span = 1, steps = 180): SatState[] {
  const out: SatState[] = [];
  const half = (PERIOD * span) / 2;
  for (let i = 0; i <= steps; i++) {
    out.push(satState(sat, tSec - half + (i / steps) * PERIOD * span));
  }
  return out;
}

export function revNumber(tSec: number) {
  return Math.floor(tSec / PERIOD) + 1;
}

/** 태양 직하점 (간이): 적위 + UTC 기반 경도 */
export function subsolar(simMs: number): { lat: number; lon: number } {
  const d = new Date(simMs);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = (simMs - start) / 86400000;
  const decl = 23.44 * Math.sin(2 * Math.PI * ((dayOfYear - 81) / 365.25));
  const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const lon = wrapLon(-(utcHours - 12) * 15);
  return { lat: decl, lon };
}

/** 두 지표점 사이 중심각(도) */
export function centralAngle(la1: number, lo1: number, la2: number, lo2: number): number {
  const a = la1 * D2R;
  const b = la2 * D2R;
  const dl = (lo2 - lo1) * D2R;
  const c = Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos(dl);
  return Math.acos(Math.max(-1, Math.min(1, c))) * R2D;
}

/** 위성이 햇빛을 받는가 (지구 그림자 밖) */
export function isSunlit(s: SatState, sun: { lat: number; lon: number }): boolean {
  const psi = centralAngle(s.lat, s.lon, sun.lat, sun.lon);
  const rho = Math.acos(RE / (RE + s.alt)) * R2D; // 고도에 의한 여유각
  return psi < 90 + rho;
}

/** 지상국에서 본 위성 앙각(도)·슬랜트 거리(km) */
export function look(s: SatState, gs: { lat: number; lon: number }): { elev: number; range: number } {
  const gamma = centralAngle(gs.lat, gs.lon, s.lat, s.lon) * D2R;
  const rs = RE + s.alt;
  const range = Math.sqrt(RE * RE + rs * rs - 2 * RE * rs * Math.cos(gamma));
  const elev = Math.atan2(Math.cos(gamma) - RE / rs, Math.sin(gamma)) * R2D;
  return { elev, range };
}

export type Pass = { startSec: number; durSec: number; maxElev: number };

/** 지상국 상공 패스 예측 (elev ≥ mask, 기본 24h, sim 초 기준) */
export function predictPasses(
  sat: Sat,
  fromSec: number,
  gs: { lat: number; lon: number },
  opts: { hours?: number; step?: number; mask?: number } = {},
): Pass[] {
  const hours = opts.hours ?? 24;
  const step = opts.step ?? 15;
  const mask = opts.mask ?? 10;
  const end = fromSec + hours * 3600;
  const passes: Pass[] = [];
  let inPass = false;
  let start = 0;
  let maxElev = -90;
  for (let t = fromSec; t <= end; t += step) {
    const { elev } = look(satState(sat, t), gs);
    if (elev >= mask) {
      if (!inPass) {
        inPass = true;
        start = t;
        maxElev = elev;
      } else if (elev > maxElev) maxElev = elev;
    } else if (inPass) {
      inPass = false;
      passes.push({ startSec: start, durSec: t - start, maxElev });
      if (passes.length >= 6) break;
    }
  }
  return passes;
}

// ---------------------------------------------------------------- 투영

/** 등장방형(equirectangular) 투영 → [0..w, 0..h] */
export const equirect = (lat: number, lon: number, w: number, h: number): [number, number] => [
  ((lon + 180) / 360) * w,
  ((90 - lat) / 180) * h,
];

/** 정사(orthographic) 투영. center를 정면으로. z>0이면 앞면(가시). */
export function ortho(
  lat: number,
  lon: number,
  center: { lat: number; lon: number },
  r: number,
  cx: number,
  cy: number,
): { x: number; y: number; z: number } {
  const la = lat * D2R;
  const lo = lon * D2R;
  const la0 = center.lat * D2R;
  const lo0 = center.lon * D2R;
  const cosc = Math.sin(la0) * Math.sin(la) + Math.cos(la0) * Math.cos(la) * Math.cos(lo - lo0);
  const x = r * Math.cos(la) * Math.sin(lo - lo0);
  const y = r * (Math.cos(la0) * Math.sin(la) - Math.sin(la0) * Math.cos(la) * Math.cos(lo - lo0));
  return { x: cx + x, y: cy - y, z: cosc };
}
