"use client";

// ============================================================================
// OrbitTracker — 캐릭터 위성 실시간 궤도 관제 대시보드
//
// 4패널: 지상궤적(등장방형) · 궤도뷰(정사 지구본) · 텔레메트리 · 패스 예측.
// 고빈도(캔버스)와 저빈도(React 텔레메트리/패스)를 분리한다 — 게임 루프와 같은 원칙.
// ============================================================================

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DOODLE_FONT } from "../lib/doodle-art";
import {
  GS,
  LAUNCH_MS,
  type Pass,
  PERIOD,
  RE,
  SATS,
  ALT as SAT_ALT,
  type SatState,
  equirect,
  groundTrack,
  isSunlit,
  look,
  ortho,
  predictPasses,
  revNumber,
  satState,
  subsolar,
  wrapLon,
} from "../lib/orbit";
import { CONTINENTS, LAND, LAND_LINE } from "../lib/worldmap";

const MAIN = SATS[0];
const SPEEDS = [1, 60, 600];
const FOOTPRINT_DEG = Math.acos(RE / (RE + SAT_ALT)) * (180 / Math.PI); // 지상국/위성 가시 반경(도)

type Tele = {
  utc: string;
  lat: number;
  lon: number;
  alt: number;
  vel: number;
  period: number;
  rev: number;
  elev: number;
  range: number;
  link: string;
  sunlit: boolean;
};

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, "0");
const hms = (sec: number) => `${pad(sec / 3600)}:${pad((sec % 3600) / 60)}:${pad(sec % 60)}`;
const fmt = (n: number, d = 2) => (n >= 0 ? "+" : "") + n.toFixed(d);

export default function OrbitTracker() {
  const mapRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<HTMLCanvasElement>(null);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  const [tele, setTele] = useState<Tele | null>(null);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [simSec, setSimSec] = useState(0); // 마운트 후 effect에서 실시간으로 채운다

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    const map = mapRef.current;
    const globe = globeRef.current;
    const mctx = map?.getContext("2d");
    const gctx = globe?.getContext("2d");
    if (!map || !globe || !mctx || !gctx) return;

    let sim = (Date.now() - LAUNCH_MS) / 1000;
    let last = performance.now();
    let raf = 0;
    let uiAcc = 0;
    let passAcc = 999;

    const fit = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const bw = Math.max(1, Math.round(w * dpr));
      const bh = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    };

    // ---- 지상궤적 (등장방형) ----
    const drawMap = () => {
      const { w, h } = fit(map, mctx);
      mctx.clearRect(0, 0, w, h);
      mctx.fillStyle = "#0a1830";
      mctx.fillRect(0, 0, w, h);

      // 대륙
      mctx.lineWidth = 1;
      for (const poly of CONTINENTS) {
        mctx.beginPath();
        poly.forEach(([lo, la], i) => {
          const [x, y] = equirect(la, lo, w, h);
          if (i) mctx.lineTo(x, y);
          else mctx.moveTo(x, y);
        });
        mctx.closePath();
        mctx.fillStyle = LAND;
        mctx.fill();
        mctx.strokeStyle = LAND_LINE;
        mctx.stroke();
      }

      // 위경도 격자
      mctx.strokeStyle = "rgba(120,160,220,0.14)";
      mctx.lineWidth = 1;
      mctx.beginPath();
      for (let lo = -180; lo <= 180; lo += 30) {
        const x = ((lo + 180) / 360) * w;
        mctx.moveTo(x, 0);
        mctx.lineTo(x, h);
      }
      for (let la = -60; la <= 60; la += 30) {
        const y = ((90 - la) / 180) * h;
        mctx.moveTo(0, y);
        mctx.lineTo(w, y);
      }
      mctx.stroke();

      // 주야 (터미네이터 폴리곤)
      const sun = subsolar(LAUNCH_MS + sim * 1000);
      drawNight(mctx, w, h, sun);

      // 태양 직하점
      {
        const [sx, sy] = equirect(sun.lat, sun.lon, w, h);
        mctx.fillStyle = "#ffd166";
        mctx.beginPath();
        mctx.arc(sx, sy, 5, 0, Math.PI * 2);
        mctx.fill();
        mctx.strokeStyle = "rgba(255,209,102,0.4)";
        mctx.lineWidth = 6;
        mctx.beginPath();
        mctx.arc(sx, sy, 5, 0, Math.PI * 2);
        mctx.stroke();
      }

      // 지상국 + 가시권
      {
        const [gx, gy] = equirect(GS.lat, GS.lon, w, h);
        mctx.setLineDash([4, 4]);
        mctx.strokeStyle = "rgba(126,232,178,0.5)";
        mctx.lineWidth = 1.2;
        mctx.beginPath();
        mctx.ellipse(gx, gy, (FOOTPRINT_DEG / 360) * w, (FOOTPRINT_DEG / 180) * h, 0, 0, Math.PI * 2);
        mctx.stroke();
        mctx.setLineDash([]);
        mctx.fillStyle = "#7ee8b2";
        mctx.fillRect(gx - 2.5, gy - 2.5, 5, 5);
        label(mctx, `GS·${GS.name}`, gx + 7, gy + 3, "#7ee8b2");
      }

      // 위성 궤적 + 현재 위치
      for (const sat of SATS) {
        const track = groundTrack(sat, sim, 1.6, 200);
        drawTrack(mctx, w, h, track, sat.color, sat === MAIN ? 2 : 1.2);
        const s = satState(sat, sim);
        const [x, y] = equirect(s.lat, s.lon, w, h);
        marker(mctx, x, y, sat.color, sat === MAIN ? 5 : 3.5);
        label(mctx, sat.name, x + 8, y - 6, sat.color);
      }
    };

    // ---- 궤도뷰 (정사 지구본, 위성 직하점을 정면 중앙에) ----
    const drawGlobe = () => {
      const { w, h } = fit(globe, gctx);
      gctx.clearRect(0, 0, w, h);
      gctx.fillStyle = "#05060f";
      gctx.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.min(w, h) * 0.42;
      const s = satState(MAIN, sim);
      const center = { lat: s.lat, lon: s.lon };

      // 지구 원반
      const grad = gctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
      grad.addColorStop(0, "#14335c");
      grad.addColorStop(1, "#081426");
      gctx.fillStyle = grad;
      gctx.beginPath();
      gctx.arc(cx, cy, r, 0, Math.PI * 2);
      gctx.fill();

      gctx.save();
      gctx.beginPath();
      gctx.arc(cx, cy, r, 0, Math.PI * 2);
      gctx.clip();

      // 대륙 (뒷면 정점은 림으로 clamp)
      for (const poly of CONTINENTS) {
        gctx.beginPath();
        poly.forEach(([lo, la], i) => {
          const p = ortho(la, lo, center, r, cx, cy);
          let { x, y } = p;
          if (p.z < 0) {
            const d = Math.hypot(x - cx, y - cy) || 1;
            x = cx + ((x - cx) / d) * r;
            y = cy + ((y - cy) / d) * r;
          }
          if (i) gctx.lineTo(x, y);
          else gctx.moveTo(x, y);
        });
        gctx.closePath();
        gctx.fillStyle = "#1c456e";
        gctx.fill();
      }

      // 격자
      gctx.strokeStyle = "rgba(130,170,225,0.18)";
      gctx.lineWidth = 1;
      for (let la = -60; la <= 60; la += 30) drawParallel(gctx, la, center, r, cx, cy);
      for (let lo = 0; lo < 360; lo += 30) drawMeridian(gctx, lo, center, r, cx, cy);

      // 주야 음영 (태양 방향 기준 선형 그라디언트)
      const sun = subsolar(LAUNCH_MS + sim * 1000);
      const sp = ortho(sun.lat, sun.lon, center, r, cx, cy);
      let dx = sp.x - cx;
      let dy = sp.y - cy;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl;
      const ng = gctx.createLinearGradient(cx + dx * r, cy + dy * r, cx - dx * r, cy - dy * r);
      const litSide = sp.z > 0 ? 0.0 : 0.25;
      ng.addColorStop(0, `rgba(3,5,16,${litSide})`);
      ng.addColorStop(0.5, "rgba(3,5,16,0.35)");
      ng.addColorStop(1, "rgba(3,5,16,0.72)");
      gctx.fillStyle = ng;
      gctx.beginPath();
      gctx.arc(cx, cy, r, 0, Math.PI * 2);
      gctx.fill();

      gctx.restore();

      // 테두리
      gctx.strokeStyle = "rgba(126,232,178,0.35)";
      gctx.lineWidth = 1.5;
      gctx.beginPath();
      gctx.arc(cx, cy, r, 0, Math.PI * 2);
      gctx.stroke();

      // 궤적 + 위성 (중앙)
      const track = groundTrack(MAIN, sim, 1.2, 160);
      gctx.strokeStyle = MAIN.color;
      gctx.lineWidth = 2;
      gctx.beginPath();
      let started = false;
      for (const p of track) {
        const o = ortho(p.lat, p.lon, center, r, cx, cy);
        if (o.z <= 0) {
          started = false;
          continue;
        }
        if (started) gctx.lineTo(o.x, o.y);
        else gctx.moveTo(o.x, o.y);
        started = true;
      }
      gctx.stroke();

      marker(gctx, cx, cy, MAIN.color, 6);
      gctx.strokeStyle = MAIN.color;
      gctx.lineWidth = 1.5;
      gctx.beginPath();
      gctx.arc(cx, cy, 12, 0, Math.PI * 2);
      gctx.stroke();
      label(gctx, MAIN.name, cx + 14, cy - 10, MAIN.color);

      // 지상국 (앞면일 때)
      const go = ortho(GS.lat, GS.lon, center, r, cx, cy);
      if (go.z > 0) {
        gctx.fillStyle = "#ffd166";
        gctx.beginPath();
        gctx.arc(go.x, go.y, 3, 0, Math.PI * 2);
        gctx.fill();
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      sim += dt * speedRef.current;
      uiAcc += dt;
      passAcc += dt * speedRef.current;

      drawMap();
      drawGlobe();

      // 텔레메트리 ~5Hz
      if (uiAcc >= 0.2) {
        uiAcc = 0;
        const s = satState(MAIN, sim);
        const sun = subsolar(LAUNCH_MS + sim * 1000);
        const lk = look(s, GS);
        const link = lk.elev >= 10 ? "LINK OK" : lk.elev >= 0 ? "ACQUIRING" : "NO SIGNAL";
        const d = new Date(LAUNCH_MS + sim * 1000);
        setSimSec(sim);
        setTele({
          utc: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
          lat: s.lat,
          lon: s.lon,
          alt: s.alt,
          vel: s.vel,
          period: PERIOD / 60,
          rev: revNumber(sim),
          elev: lk.elev,
          range: lk.range,
          link,
          sunlit: isSunlit(s, sun),
        });
      }
      // 패스 예측: sim 30초마다 재계산
      if (passAcc >= 30) {
        passAcc = 0;
        setPasses(predictPasses(MAIN, sim, GS));
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onResize = () => {
      drawMap();
      drawGlobe();
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const nextPass = passes.find((p) => p.startSec > simSec);
  const countdown = nextPass ? Math.max(0, nextPass.startSec - simSec) : null;

  return (
    <div
      className="min-h-full bg-[#070a16] text-zinc-100"
      style={{ fontFamily: DOODLE_FONT }}
    >
      <header className="flex items-center justify-between px-4 py-3">
        <Link href="/" className="text-sm text-zinc-400 underline underline-offset-4">
          ← 기지
        </Link>
        <span className="text-lg font-bold tracking-widest text-[#8ecbff]">궤도 관제</span>
        <div className="flex gap-1">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setSpeed(sp)}
              className={`rounded px-2 py-0.5 text-xs font-bold ${
                speed === sp ? "bg-[#7ee8b2] text-[#0a1830]" : "bg-white/10 text-zinc-300"
              }`}
            >
              ×{sp}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-3 px-3 pb-16">
        {/* GROUND TRACK */}
        <Panel>
          <PanelHead
            left="GROUND TRACK · EQUIRECTANGULAR"
            right={`UTC ${tele?.utc ?? "--:--:--"} · SATS ${SATS.length} · GS`}
            sub={GS.name}
          />
          <canvas ref={mapRef} className="block h-44 w-full" />
        </Panel>

        {/* ORBIT VIEW */}
        <Panel>
          <PanelHead left="ORBIT VIEW · LIVE" right="" />
          <canvas ref={globeRef} className="block aspect-square w-full" />
          <div className="py-1.5 text-center text-xs text-zinc-400">
            NADIR {tele ? `${fmt(tele.lat, 2)}° · ${fmt(tele.lon, 2)}°` : "—"}
          </div>
        </Panel>

        {/* TELEMETRY */}
        <Panel>
          <PanelHead left={`TELEMETRY · ${MAIN.name}`} right={tele?.sunlit ? "☀ SUNLIT" : "🌙 ECLIPSE"} />
          <div className="grid grid-cols-3 gap-2 p-2">
            <Cell k="LAT" v={tele ? fmt(tele.lat, 2) : "—"} u="°" />
            <Cell k="LON" v={tele ? fmt(tele.lon, 2) : "—"} u="°" />
            <Cell k="ALT" v={tele ? `${tele.alt}` : "—"} u="km" />
            <Cell k="VEL" v={tele ? tele.vel.toFixed(2) : "—"} u="km/s" />
            <Cell k="PERIOD" v={tele ? tele.period.toFixed(1) : "—"} u="min" />
            <Cell k="REV" v={tele ? `#${tele.rev}` : "—"} />
            <Cell k="ELEV @GS" v={tele ? fmt(tele.elev, 1) : "—"} u="°" />
            <Cell k="RANGE @GS" v={tele ? `${Math.round(tele.range)}` : "—"} u="km" />
            <Cell
              k="LINK"
              v={tele?.link ?? "—"}
              accent={tele?.link === "LINK OK" ? "#7ee8b2" : tele?.link === "NO SIGNAL" ? "#ff8080" : "#ffd166"}
            />
          </div>
        </Panel>

        {/* PASS PREDICT */}
        <Panel>
          <PanelHead
            left="PASS PREDICT · 24H"
            right={countdown != null ? `NEXT T-${hms(countdown)}` : "NEXT —"}
            sub="ELEV ≥ 10° · ★ = 45°↑"
          />
          <div className="divide-y divide-white/5">
            {passes.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-zinc-500">계산 중…</div>
            )}
            {passes.map((p, i) => {
              const d = new Date(LAUNCH_MS + p.startSec * 1000);
              return (
                <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="tabular-nums text-zinc-200">
                    {p.maxElev >= 45 && <span className="text-[#ffd166]">★ </span>}
                    {pad(d.getUTCHours())}:{pad(d.getUTCMinutes())} UTC
                  </span>
                  <span className="tabular-nums text-zinc-400">{Math.round(p.durSec / 60)}분</span>
                  <span className="tabular-nums font-bold text-[#8ecbff]">MAX {Math.round(p.maxElev)}°</span>
                </div>
              );
            })}
          </div>
        </Panel>

        <p className="px-1 pt-1 text-center text-xs text-zinc-600">
          냠냠샛 — 케플러 법칙으로 살짝 진짜인 궤도 시뮬레이션 🌍 · 배속으로 궤도를 관찰해요
        </p>
      </div>
    </div>
  );
}

// ---- 작은 프레젠테이션 조각들 ----

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#1b2a4a] bg-[#0b1428]/90">
      {children}
    </section>
  );
}

function PanelHead({ left, right, sub }: { left: string; right?: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between border-b border-[#1b2a4a] px-3 py-2">
      <div>
        <div className="text-xs font-bold tracking-widest text-[#8ecbff]">{left}</div>
        {sub && <div className="text-xs text-zinc-500">{sub}</div>}
      </div>
      {right && <div className="text-right text-xs tracking-wide text-zinc-400">{right}</div>}
    </div>
  );
}

function Cell({ k, v, u, accent }: { k: string; v: string; u?: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-black/25 px-2 py-1.5">
      <div className="text-[10px] tracking-widest text-zinc-500">{k}</div>
      <div className="text-lg font-bold leading-tight" style={{ color: accent ?? "#e8ecf7" }}>
        {v}
        {u && <span className="ml-0.5 text-[11px] text-zinc-500">{u}</span>}
      </div>
    </div>
  );
}

// ---- 캔버스 헬퍼 (모듈 스코프, 순수) ----

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.font = "10px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(5,8,20,0.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function marker(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, r: number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(5,8,20,0.8)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** 등장방형 궤적: 경도 랩(±180 점프)에서 선을 끊는다 */
function drawTrack(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  track: SatState[],
  color: string,
  width: number,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  let prevLon = NaN;
  track.forEach((p, i) => {
    const [x, y] = equirect(p.lat, p.lon, w, h);
    if (i === 0 || Math.abs(p.lon - prevLon) > 180) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    prevLon = p.lon;
  });
  ctx.stroke();
}

function drawNight(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sun: { lat: number; lon: number },
) {
  const tanDecl = Math.tan(sun.lat * (Math.PI / 180));
  const pts: [number, number][] = [];
  for (let lon = -180; lon <= 180; lon += 3) {
    const latT =
      Math.abs(tanDecl) < 1e-4
        ? 0
        : Math.atan(-Math.cos((lon - sun.lon) * (Math.PI / 180)) / tanDecl) * (180 / Math.PI);
    pts.push(equirect(latT, lon, w, h));
  }
  const northDark = sun.lat < 0; // 태양이 남반구면 북극이 밤
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  if (northDark) {
    ctx.lineTo(w, 0);
    ctx.lineTo(0, 0);
  } else {
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(4,6,18,0.5)";
  ctx.fill();
}

function drawParallel(
  ctx: CanvasRenderingContext2D,
  lat: number,
  center: { lat: number; lon: number },
  r: number,
  cx: number,
  cy: number,
) {
  ctx.beginPath();
  let started = false;
  for (let lon = -180; lon <= 180; lon += 6) {
    const o = ortho(lat, wrapLon(lon), center, r, cx, cy);
    if (o.z <= 0) {
      started = false;
      continue;
    }
    if (started) ctx.lineTo(o.x, o.y);
    else ctx.moveTo(o.x, o.y);
    started = true;
  }
  ctx.stroke();
}

function drawMeridian(
  ctx: CanvasRenderingContext2D,
  lon: number,
  center: { lat: number; lon: number },
  r: number,
  cx: number,
  cy: number,
) {
  ctx.beginPath();
  let started = false;
  for (let lat = -90; lat <= 90; lat += 6) {
    const o = ortho(lat, lon, center, r, cx, cy);
    if (o.z <= 0) {
      started = false;
      continue;
    }
    if (started) ctx.lineTo(o.x, o.y);
    else ctx.moveTo(o.x, o.y);
    started = true;
  }
  ctx.stroke();
}
