// Render de Monigotes: escenario lateral fijo y luchadores dibujados con líneas. Las poses
// (correr, saltar, golpear, aturdido, inerte) se calculan a partir del estado: no hay sprites.
import { PLAYER_COLORS, PLAYER_NAMES, type RGB } from "../core/config";
import {
  badge, css, fillCircle, fitText, panel, roundRect, segmentBar, shade, shadowText, text, titleText, type Ctx,
} from "../core/draw";
import {
  ATTACK_ANIM, BOMB_FUSE, BOMB_RADIUS, EXPLOSION_TIME, HP, ROUND_TIME, SH, SW, W_BOMB, W_PISTOL, W_SWORD,
  type Weapon,
} from "./config";
import type { AttackKind } from "./fight";
import { STAGES, type Stage } from "./stages";

export interface FighterSprite {
  index: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  ground: boolean;
  hp: number;
  dead: boolean;
  gone: boolean;
  angle: number;
  weapon: Weapon;
  ammo: number;
  attackT: number;
  attackKind: AttackKind;
  hitT: number;
}

export interface StickResult {
  index: number;
  place: number;
  ai: boolean;
}

/** Todo lo necesario para dibujar un frame. */
export interface StickView {
  stage: number;
  fighters: FighterSprite[];
  bullets: { x: number; y: number; vx: number }[];
  bombs: { x: number; y: number; fuse: number }[];
  crates: { x: number; y: number; kind: Weapon }[];
  explosions: { x: number; y: number; t: number }[];
  me: number;
  phase: number;
  countdown: number;
  time: number;
  wins: number[];
  aiSlots: boolean[];
  results: StickResult[] | null;
  netLabel: string;
  footer: string;
}

const TINY = "bold 6px Arial, sans-serif";
const SMALL = "bold 8px Arial, sans-serif";
const MID = "bold 10px Arial, sans-serif";

export function fighterName(index: number, ai: boolean): string {
  return ai ? `CPU ${index + 1}` : PLAYER_NAMES[index];
}

/** Fondo de cada escenario (cielo y siluetas), dibujado una vez. */
const backgrounds = new Map<number, HTMLCanvasElement>();
function background(index: number): HTMLCanvasElement {
  let c = backgrounds.get(index);
  if (c) return c;
  const st: Stage = STAGES[index];
  c = document.createElement("canvas");
  c.width = SW;
  c.height = SH;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, SH);
  grad.addColorStop(0, css(st.skyTop));
  grad.addColorStop(1, css(st.skyBottom));
  g.fillStyle = grad;
  g.fillRect(0, 0, SW, SH);
  // Ciudad lejana: edificios con ventanas, siempre iguales para cada escenario.
  let seed = 1234 + index * 977;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [layer, k] of [[0, 0.75], [1, 1]] as const) {
    const color = shade(st.city, k);
    let x = -5;
    while (x < SW) {
      const w = 14 + rnd() * 22;
      const h = (layer ? 40 : 60) + rnd() * (layer ? 50 : 60);
      g.fillStyle = css(color);
      g.fillRect(x, SH - h, w, h);
      g.fillStyle = css(shade(st.skyBottom, 0.9), 0.35);
      for (let wy = SH - h + 5; wy < SH - 6; wy += 7) {
        for (let wx = x + 3; wx < x + w - 3; wx += 5) if (rnd() < 0.35) g.fillRect(wx, wy, 2, 3);
      }
      x += w + 2 + rnd() * 6;
    }
  }
  backgrounds.set(index, c);
  return c;
}

export class StickRenderer {
  time = 0;
  // Fase de la zancada de cada luchador (avanza con lo que se mueve en el suelo).
  private stride = new Map<number, { phase: number; x: number }>();

  reset() {
    this.stride.clear();
  }

  update(dt: number) {
    this.time += dt;
  }

  draw(ctx: Ctx, v: StickView) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(background(v.stage), 0, 0);
    this.drawPlatforms(ctx, STAGES[v.stage]);
    for (const c of v.crates) drawCrate(ctx, c.x, c.y, c.kind);
    // Primero los cuerpos inertes, luego los vivos y el propio encima.
    const order = [...v.fighters].filter((f) => !f.gone)
      .sort((a, b) => Number(!a.dead) - Number(!b.dead) || Number(a.index === v.me) - Number(b.index === v.me));
    for (const f of order) this.drawFighter(ctx, f, f.index === v.me);
    for (const b of v.bullets) {
      ctx.strokeStyle = "rgba(255,230,120,0.95)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - Math.sign(b.vx) * 7, b.y);
      ctx.stroke();
    }
    for (const b of v.bombs) drawBomb(ctx, b.x, b.y - 3, b.fuse, this.time);
    for (const e of v.explosions) drawExplosion(ctx, e.x, e.y, e.t);
    this.drawHud(ctx, v);
  }

  private drawPlatforms(ctx: Ctx, st: Stage) {
    for (const p of st.platforms) {
      const h = p.solid ? 10 : 5;
      roundRect(ctx, p.x, p.y, p.w, h, 2, p.solid ? [52, 48, 60] : [80, 74, 90], [20, 18, 26], 1);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(p.x + 2, p.y + 1, p.w - 4, 1);
    }
  }

  private drawFighter(ctx: Ctx, f: FighterSprite, mine: boolean) {
    const color = PLAYER_COLORS[f.index];
    const s = this.stride.get(f.index) ?? { phase: 0, x: f.x };
    if (f.ground && !f.dead) s.phase += Math.abs(f.x - s.x) * 0.16;
    s.x = f.x;
    this.stride.set(f.index, s);
    const pose = makePose(f, s.phase, this.time);
    ctx.save();
    ctx.translate(f.x, f.y);
    // Cuerpo inerte: gira entero alrededor de la cadera.
    if (f.dead) {
      ctx.translate(0, -12);
      ctx.rotate(f.angle);
      ctx.translate(0, 12);
    } else if (f.hitT > 0) {
      ctx.translate(0, -12);
      ctx.rotate(-f.facing * 0.35);
      ctx.translate(0, 12);
    }
    ctx.scale(f.facing, 1);
    const ink = f.dead ? shade(color, 0.55) : color;
    ctx.strokeStyle = css(ink);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    const limb = (a: [number, number], b: [number, number], c: [number, number]) => {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.stroke();
    };
    // Pierna y brazo traseros algo más oscuros para dar profundidad.
    ctx.strokeStyle = css(shade(ink, 0.7));
    limb(pose.hip, pose.kneeB, pose.footB);
    limb(pose.shoulder, pose.elbowB, pose.handB);
    ctx.strokeStyle = css(ink);
    ctx.beginPath();
    ctx.moveTo(pose.hip[0], pose.hip[1]);
    ctx.lineTo(pose.neck[0], pose.neck[1]);
    ctx.stroke();
    limb(pose.hip, pose.kneeF, pose.footF);
    this.drawWeapon(ctx, f, pose);
    limb(pose.shoulder, pose.elbowF, pose.handF);
    fillCircle(ctx, pose.head[0], pose.head[1], 4.2, ink);
    if (!f.dead) {
      // Ojo mirando al frente
      fillCircle(ctx, pose.head[0] + 1.6, pose.head[1] - 0.6, 0.9, [20, 20, 28]);
    }
    ctx.restore();
    if (!f.dead) {
      // Número sobre la cabeza (identifica también en escala de grises) y marca propia.
      const ty = f.y - 38;
      shadowText(ctx, String(f.index + 1), f.x, ty, [255, 255, 255], "7px", "center", "middle");
      if (mine) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(f.x - 3, ty - 9);
        ctx.lineTo(f.x + 3, ty - 9);
        ctx.lineTo(f.x, ty - 5);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private drawWeapon(ctx: Ctx, f: FighterSprite, pose: Pose) {
    const [hx, hy] = pose.handF;
    if (f.weapon === W_SWORD) {
      // La hoja sigue la dirección del antebrazo.
      const ax = hx - pose.elbowF[0], ay = hy - pose.elbowF[1];
      const len = Math.hypot(ax, ay) || 1;
      ctx.strokeStyle = "rgb(225,230,240)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + (ax / len) * 15, hy + (ay / len) * 15);
      ctx.stroke();
      ctx.strokeStyle = "rgb(120,90,40)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx - (ay / len) * 2.5, hy + (ax / len) * 2.5);
      ctx.lineTo(hx + (ay / len) * 2.5, hy - (ax / len) * 2.5);
      ctx.stroke();
    } else if (f.weapon === W_PISTOL) {
      ctx.fillStyle = "rgb(40,40,48)";
      ctx.fillRect(hx - 1, hy - 2.5, 7, 2.6);
      ctx.fillRect(hx - 1, hy - 1, 2.2, 3.5);
      if (f.attackKind === 3 && f.attackT >= 0 && f.attackT < 0.06) fillCircle(ctx, hx + 8, hy - 1.2, 2.2, [255, 220, 90]);
    } else if (f.weapon === W_BOMB) {
      drawBomb(ctx, hx, hy, BOMB_FUSE, this.time);
    }
  }

  // --- HUD ---
  private drawHud(ctx: Ctx, v: StickView) {
    // Paneles de vida, uno por luchador, como en las recreativas de lucha.
    const n = v.fighters.length;
    const pw = Math.min(78, (SW - 8) / n);
    v.fighters.forEach((f, i) => {
      const x = 4 + i * pw;
      const color = PLAYER_COLORS[f.index];
      panel(ctx, x, 2, pw - 4, 18, f.dead ? [90, 90, 100] : color, 0.6);
      badge(ctx, x + 6.5, 11, 4, f.dead ? [110, 110, 120] : color, String(f.index + 1));
      const name = fighterName(f.index, v.aiSlots[i]) + (f.index === v.me ? " (tú)" : "");
      text(ctx, fitText(ctx, name, pw - 34, TINY), x + 13, 3.5, f.dead ? [150, 150, 160] : [235, 235, 245], TINY);
      text(ctx, `★${v.wins[f.index] ?? 0}`, x + pw - 7, 3.5, [255, 220, 60], TINY, "right");
      const k = Math.max(0, f.hp) / HP;
      const hpColor: RGB = f.dead ? [120, 120, 120] : k > 0.5 ? [110, 220, 110] : k > 0.25 ? [250, 200, 70] : [240, 80, 70];
      segmentBar(ctx, x + 13, 12, pw - 21, 4, k, hpColor, 10);
    });
    const left = Math.max(0, Math.ceil(ROUND_TIME - v.time));
    titleText(ctx, String(left), SW / 2, 22, left <= 10 ? [255, 120, 100] : [255, 255, 255], "10px");

    if (v.netLabel) shadowText(ctx, v.netLabel, SW - 3, SH - 17, [200, 200, 220], TINY, "right");
    if (v.footer && !v.results) shadowText(ctx, v.footer, SW / 2, SH - 9, [235, 235, 245], TINY, "center");

    if (v.phase === 0) {
      titleText(ctx, String(Math.ceil(v.countdown)), SW / 2, 58, [255, 230, 80], "36px");
    } else if (v.phase === 1 && v.time < 0.8) {
      titleText(ctx, "¡A PELEAR!", SW / 2, 64, [120, 255, 120], "22px");
    }
    const me = v.fighters[v.me];
    if (me?.dead && !v.results) shadowText(ctx, "K.O. · mirando", SW / 2, 34, [255, 140, 80], SMALL, "center");
    if (me && !me.dead && me.weapon) {
      const label = me.weapon === W_SWORD ? "Espada" : me.weapon === W_PISTOL ? `Pistola ${me.ammo}` : `Bombas ${me.ammo}`;
      shadowText(ctx, label, 4, SH - 17, [235, 235, 245], TINY);
    }
    if (v.results) this.drawResults(ctx, v);
  }

  private drawResults(ctx: Ctx, v: StickView) {
    const res = v.results!;
    const winners = res.filter((r) => r.place === 1);
    const solo = v.fighters.length === 1;
    const title = solo
      ? (v.fighters[0].dead ? `AGUANTASTE ${Math.floor(v.time)} s` : "¡AGUANTASTE!")
      : winners.length === 1 ? `¡GANA ${fighterName(winners[0].index, winners[0].ai).toUpperCase()}!` : "¡EMPATE!";
    const titleColor: RGB = winners.length === 1 && !solo ? PLAYER_COLORS[winners[0].index] : [235, 235, 245];
    const top = 40;
    panel(ctx, 50, top, SW - 100, 40 + res.length * 14, [255, 61, 139], 0.85);
    titleText(ctx, title, SW / 2, top + 5, titleColor, MID);
    text(ctx, "Victorias", SW - 60, top + 20, [170, 170, 190], TINY, "right");
    res.forEach((r, i) => {
      const y = top + 28 + i * 14;
      const color = PLAYER_COLORS[r.index];
      badge(ctx, 64, y + 4, 4, color, String(r.index + 1));
      text(ctx, `${r.place}º`, 72, y, [255, 255, 255], MID);
      text(ctx, fighterName(r.index, r.ai) + (r.index === v.me ? " (tú)" : ""), 90, y, color, MID);
      text(ctx, String(v.wins[r.index] ?? 0), SW - 60, y, [255, 220, 60], MID, "right");
    });
    const lit = Math.floor(this.time * 2) % 2 === 0; // parpadea como un "PULSA START"
    text(ctx, fitText(ctx, v.footer, SW - 108, TINY), SW / 2, top + 31 + res.length * 14, lit ? [255, 236, 190] : [140, 130, 105], TINY, "center");
  }
}

// --- Poses ---
type P = [number, number];
interface Pose {
  hip: P; neck: P; head: P; shoulder: P;
  kneeF: P; footF: P; kneeB: P; footB: P;
  elbowF: P; handF: P; elbowB: P; handB: P;
}

/** Punto a `len` de `from` con ángulo `a` (0 = hacia abajo, positivo = hacia delante). */
const seg = (from: P, a: number, len: number): P => [from[0] + Math.sin(a) * len, from[1] + Math.cos(a) * len];

/**
 * Pose en coordenadas locales: pies en (0, 0), mirando a la derecha (+x). El dibujo se refleja
 * para mirar a la izquierda.
 */
function makePose(f: FighterSprite, phase: number, time: number): Pose {
  const hip: P = [0, -13];
  const neck: P = [0, -24];
  const head: P = [0, -28.5];
  const shoulder: P = [0, -22];
  const run = f.ground && Math.abs(f.vx) > 15 && !f.dead;
  // Piernas (muslo y espinilla)
  let tf: number, tb: number, sf: number, sb: number;
  if (f.dead) {
    [tf, tb, sf, sb] = [0.7, -0.6, 0.2, -0.3];
  } else if (!f.ground) {
    // En el aire: rodillas recogidas; la patada aérea estira la pierna delantera.
    const kicking = f.attackKind === 1 && f.attackT >= 0;
    [tf, tb, sf, sb] = kicking ? [1.45, -0.3, 1.5, -0.8] : [0.8, -0.25, -0.2, -0.9];
  } else if (run) {
    const sw = Math.sin(phase);
    [tf, tb] = [sw * 0.75, -sw * 0.75];
    [sf, sb] = [tf - Math.max(0, -sw) * 0.9, tb - Math.max(0, sw) * 0.9];
  } else {
    [tf, tb, sf, sb] = [0.18, -0.18, 0.1, -0.1];
  }
  const kneeF = seg(hip, tf, 7), kneeB = seg(hip, tb, 7);
  const footF = seg(kneeF, sf, 7), footB = seg(kneeB, sb, 7);
  // Brazos (brazo y antebrazo)
  let af: number, ab: number, ff: number, fb: number;
  const breathe = Math.sin(time * 3 + f.index) * 0.06;
  if (f.dead) {
    [af, ab, ff, fb] = [2.2, -2, 2.4, -2.2];
  } else if (f.attackT >= 0 && f.attackT <= ATTACK_ANIM) {
    const k = Math.min(1, f.attackT / 0.08); // sale rápido y vuelve
    const back = Math.max(0, (f.attackT - 0.1) / (ATTACK_ANIM - 0.1));
    const ext = k * (1 - back * 0.7);
    if (f.attackKind === 2) {
      // Espadazo: de arriba a delante
      const a = 2.8 - ext * 1.3;
      [af, ff] = [a, a - 0.2];
    } else if (f.attackKind === 4) {
      [af, ff] = [2.6 - ext * 1.2, 2.4 - ext * 1.1];
    } else {
      [af, ff] = [0.3 + ext * 1.3, 0.3 + ext * 1.3];
    }
    [ab, fb] = [-0.5, -0.1];
  } else if (f.weapon === W_PISTOL) {
    [af, ff, ab, fb] = [1.45, 1.6, -0.4, 0];
  } else if (f.weapon === W_SWORD) {
    [af, ff, ab, fb] = [0.6, 1.5, -0.35, 0];
  } else if (run) {
    const sw = Math.sin(phase);
    [af, ab] = [-sw * 0.8, sw * 0.8];
    [ff, fb] = [af + 0.6, ab + 0.6];
  } else if (!f.ground) {
    [af, ab, ff, fb] = [2.2, -2.0, 2.6, -2.3];
  } else {
    [af, ab, ff, fb] = [0.35 + breathe, -0.3 - breathe, 0.2, -0.2];
  }
  const elbowF = seg(shoulder, af, 6), elbowB = seg(shoulder, ab, 6);
  const handF = seg(elbowF, ff, 6), handB = seg(elbowB, fb, 6);
  return { hip, neck, head, shoulder, kneeF, footF, kneeB, footB, elbowF, handF, elbowB, handB };
}

// --- objetos ---
function drawCrate(ctx: Ctx, x: number, y: number, kind: Weapon) {
  roundRect(ctx, x - 6, y - 12, 12, 12, 1.5, [170, 120, 60], [90, 60, 30], 1);
  ctx.strokeStyle = "rgba(90,60,30,0.9)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 12);
  ctx.lineTo(x + 6, y);
  ctx.stroke();
  // Icono del arma que contiene
  const label = kind === W_SWORD ? "E" : kind === W_PISTOL ? "P" : "B";
  text(ctx, label, x, y - 5.6, [255, 245, 220], "bold 7px Arial, sans-serif", "center", "middle");
}

function drawBomb(ctx: Ctx, x: number, y: number, fuse: number, time: number) {
  fillCircle(ctx, x, y, 3.2, [30, 30, 36]);
  fillCircle(ctx, x - 1, y - 1, 1, [110, 110, 120]);
  // La mecha parpadea más rápido al final.
  const blink = Math.sin(time * (fuse < 0.5 ? 40 : 14)) > 0;
  if (blink) fillCircle(ctx, x + 2, y - 3.4, 1.3, [255, 190, 60]);
}

function drawExplosion(ctx: Ctx, x: number, y: number, t: number) {
  const k = t / EXPLOSION_TIME;
  const r = BOMB_RADIUS * (0.35 + k * 0.75);
  ctx.fillStyle = `rgba(255,${Math.round(200 - k * 120)},60,${0.75 * (1 - k)})`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,250,210,${0.9 * (1 - k * 1.6)})`;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
}
