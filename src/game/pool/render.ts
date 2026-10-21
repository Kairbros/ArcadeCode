// Render de Billar: mesa vista desde arriba en 3D (Three.js, proyección ortogonal) con bolas que ruedan y
// caen por las troneras; encima, en 2D, la línea de tiro, el taco y el HUD (jugadores, potencia, efecto).
import { C_DIM, C_GOLD, C_LINE, C_LOSE, C_MUTE, C_TEXT } from "../core/theme";
import * as THREE from "three";
import { PLAYER_COLORS, type RGB } from "../core/config";
import { badge, css, fitText, line, panel, shadowText, strokeCircle, text, titleText, fillCircle, type Ctx, hudStrip } from "../core/draw";
import { glRenderer, renderInto } from "../core/three";
import {
  BALL_COLORS, BALL_R, BAR, FOLLOW_K, CORNER_R, HEAD_X, PH, PW, POCKETS, RAIL, SHOT_TIME, SIDE_R, SPIN, TCX, TCY, TH, TW, ZOOM,
  toScreen,
} from "./config";
import { bestPocket, trace, type PBall } from "./table";

export interface PoolView {
  balls: readonly PBall[];
  /** Asiento del que mira (0 anfitrión, 1 invitado; 2 y 3 miran). */
  me: number;
  /** Quien mira controla el taco ahora (le toca y no es IA ni remoto). */
  mine: boolean;
  turn: number;
  phase: number;
  groups: readonly number[];
  placing: boolean;
  head: boolean;
  aim: { angle: number; power: number; top: number; side: number; call: number };
  timer: number;
  winner: number;
  msg: string;
  wins: readonly number[];
  /** Un nombre por asiento (2 o 4). Los equipos son asientos pares contra impares. */
  names: readonly string[];
  /** Asiento que se muestra por cada equipo: el que tira ahora o el próximo. */
  shooters: readonly number[];
  /** Cuántas bolas de su grupo le quedan a cada equipo (7 = mesa abierta). */
  left: readonly number[];
  shots: number;
  ai: readonly boolean[];
  netLabel: string;
  footer: string;
}

const TINY = "bold 7px Arial, sans-serif";
const SMALL = "bold 8px Arial, sans-serif";
const MID = "bold 11px Arial, sans-serif";

/** Textura de una bola: color o rayas, con el número en dos puntos opuestos del ecuador. */
function ballTexture(id: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d")!;
  const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
  const base = id === 0 ? 0xf4f4ee : BALL_COLORS[id > 8 ? id - 8 : id];
  if (id > 8) {
    g.fillStyle = "#f4f4ee";
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = hex(base);
    g.fillRect(0, 16, 128, 32);
  } else {
    g.fillStyle = hex(base);
    g.fillRect(0, 0, 128, 64);
  }
  for (const u of id === 0 ? [] : [32, 96]) {
    g.fillStyle = "#f4f4ee";
    g.beginPath();
    g.arc(u, 32, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#101010";
    g.font = "bold 15px Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(id), u, 33);
  }
  if (id === 0) {
    g.fillStyle = "#d02020";
    g.beginPath();
    g.arc(32, 32, 3, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(96, 32, 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** La escena 3D: mesa, bolas y sombras; se construye una vez. */
class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  private meshes: THREE.Mesh[] = [];
  private shadows: THREE.Mesh[] = [];
  private roll: THREE.Quaternion[] = [];
  private prev: { x: number; y: number }[] = [];
  private sink: number[] = Array(16).fill(0);
  private readonly q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

  constructor() {
    this.camera = new THREE.OrthographicCamera(-TCX / ZOOM, (PW - TCX) / ZOOM, TCY / ZOOM, -(PH - TCY) / ZOOM, 1, 300);
    this.camera.position.set(0, 120, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
    const sc = this.scene;
    sc.background = new THREE.Color(0x14111c);

    sc.add(new THREE.AmbientLight(0xffffff, 0.85));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.1);
    sun.position.set(-50, 120, -40);
    sc.add(sun);
    const rim = new THREE.DirectionalLight(0x9ab4ff, 0.5);
    rim.position.set(60, 60, 50);
    sc.add(rim);

    const mat = (color: number, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough });
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      sc.add(mesh);
      return mesh;
    };

    // Paño, con una franja de fieltro bajo las bandas.
    const felt = mat(0x1c7d4c, 0.95), cushion = mat(0x136c40, 0.85), wood = mat(0x6a3c1c, 0.55), dark = mat(0x050507, 1);
    box(TW + 24, 1, TH + 24, 0, -0.5, 0, felt);
    // Bandas con hueco en las troneras.
    const cu = 4, h = 3;
    const longGap = SIDE_R + 1.5, cornerGap = CORNER_R + 1.5;
    for (const sy of [-1, 1]) {
      const z = sy * (TH / 2 + cu / 2);
      const len = TW / 2 - cornerGap - longGap;
      for (const sx of [-1, 1]) box(len, h, cu, sx * (longGap + len / 2), h / 2, z, cushion);
    }
    for (const sx of [-1, 1]) box(cu, h, TH - cornerGap * 2, sx * (TW / 2 + cu / 2), h / 2, 0, cushion);
    // Marco de madera.
    const wd = RAIL - cu;
    for (const sy of [-1, 1]) box(TW + RAIL * 2, 4, wd, 0, 2, sy * (TH / 2 + cu + wd / 2), wood);
    for (const sx of [-1, 1]) box(wd, 4, TH + cu * 2, sx * (TW / 2 + cu + wd / 2), 2, 0, wood);
    // Diamantes en la madera.
    const gem = mat(0xe8dcc0, 0.4);
    for (const k of [-3, -2, -1, 1, 2, 3]) for (const sy of [-1, 1]) box(2.2, 0.6, 2.2, (k * TW) / 8, 4.2, sy * (TH / 2 + cu + wd / 2), gem);
    for (const k of [-1, 0, 1]) for (const sx of [-1, 1]) box(2.2, 0.6, 2.2, sx * (TW / 2 + cu + wd / 2), 4.2, (k * TH) / 4, gem);
    // Troneras: discos negros por encima de las bandas.
    POCKETS.forEach(([px, py], i) => {
      const r = i === 1 || i === 4 ? SIDE_R + 0.2 : CORNER_R + 0.2;
      const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.4, 24), dark);
      d.position.set(px, 4.4, py);
      sc.add(d);
    });

    // Bolas y sombras.
    const sphere = new THREE.SphereGeometry(BALL_R, 22, 16);
    const blob = new THREE.CircleGeometry(BALL_R * 1.1, 16).rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false });
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(sphere, new THREE.MeshStandardMaterial({ map: ballTexture(i), roughness: 0.22, metalness: 0.02 }));
      sc.add(m);
      this.meshes.push(m);
      const s = new THREE.Mesh(blob, shadowMat);
      s.position.y = 0.06;
      sc.add(s);
      this.shadows.push(s);
      this.roll.push(new THREE.Quaternion());
      this.prev.push({ x: 0, y: 0 });
    }
  }

  update(v: PoolView, dt: number) {
    const axis = new THREE.Vector3();
    for (let i = 0; i < 16; i++) {
      const b = v.balls[i], m = this.meshes[i], s = this.shadows[i];
      const p = this.prev[i];
      if (b.pocket >= 0) {
        // Cae por la tronera: se encoge y se hunde.
        this.sink[i] = Math.min(1, this.sink[i] + dt / 0.28);
        const k = 1 - this.sink[i];
        m.visible = s.visible = k > 0.02;
        m.scale.setScalar(Math.max(0.01, k));
        m.position.set(b.x, 3.2 + BALL_R * k - this.sink[i] * 3, b.y);
        s.visible = false;
        continue;
      }
      this.sink[i] = 0;
      m.visible = s.visible = true;
      m.scale.setScalar(1);
      const dx = b.x - p.x, dz = b.y - p.y;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.0005 && dist < 30) {
        axis.set(dz, 0, -dx).normalize();
        this.roll[i].premultiply(new THREE.Quaternion().setFromAxisAngle(axis, dist / BALL_R));
      }
      p.x = b.x;
      p.y = b.y;
      m.position.set(b.x, BALL_R, b.y);
      m.quaternion.copy(this.roll[i]).multiply(this.q0);
      s.position.set(b.x + 1.4, 0.06, b.y + 1.8);
    }
  }
}

export class PoolRenderer {
  private stage: Stage | null = null;
  private time = 0;
  private lastDraw = 0;
  // Golpe de taco: al subir `shots` el taco avanza un instante hacia la blanca.
  private lastShots = 0;
  private strike = 0;
  private strikeAngle = 0;
  private strikePull = 0;

  reset() {
    this.lastShots = 0;
    this.strike = 0;
  }

  update(dt: number) {
    this.time += dt;
    if (this.strike > 0) this.strike -= dt;
  }

  draw(ctx: Ctx, v: PoolView, pixelScale = 1) {
    const now = performance.now();
    const dt = this.lastDraw ? Math.min(0.1, (now - this.lastDraw) / 1000) : 0;
    this.lastDraw = now;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, PW, PH);
    if (!glRenderer()) {
      text(ctx, "Este equipo no puede mostrar gráficos 3D (WebGL)", PW / 2, PH / 2 - 10, [255, 200, 160], SMALL, "center");
      this.drawHud(ctx, v);
      return;
    }
    const stage = (this.stage ??= new Stage());
    if (v.shots !== this.lastShots) {
      if (v.shots > this.lastShots) {
        this.strike = 0.12;
        this.strikeAngle = v.aim.angle;
        this.strikePull = 4 + v.aim.power * 38;
      }
      this.lastShots = v.shots;
    }
    stage.update(v, dt);
    renderInto(ctx, stage.scene, stage.camera, PW, PH, pixelScale, 1.1);
    this.drawTable(ctx, v);
    this.drawHud(ctx, v);
  }

  // --- Sobre la mesa: línea de tiro, taco y marcas ---
  private drawTable(ctx: Ctx, v: PoolView) {
    const cue = v.balls[0];
    if (cue.pocket >= 0) return;
    const [cx, cy] = toScreen(cue.x, cue.y);
    if (v.phase === 0 && v.placing && v.head) {
      // Línea de cabeza: la blanca solo puede ir a su izquierda.
      const [hx, hy0] = toScreen(HEAD_X, -TH / 2);
      const [, hy1] = toScreen(HEAD_X, TH / 2);
      ctx.save();
      ctx.setLineDash([2, 3]);
      line(ctx, hx, hy0, hx, hy1, [255, 255, 255], 0.8);
      ctx.restore();
    }
    if (v.phase === 0 && v.placing) {
      strokeCircle(ctx, cx, cy, BALL_R * ZOOM + 2, C_GOLD, 1);
      return;
    }
    if (v.phase === 2) return;
    if (v.phase === 1) {
      if (this.strike > 0) this.drawStick(ctx, cx, cy, this.strikeAngle, this.strikePull * (this.strike / 0.12));
      return;
    }
    const a = v.aim;
    const pull = 4 + a.power * 38;
    const tr = trace(v.balls, a.angle);
    if (v.mine) {
      const [gx, gy] = toScreen(tr.gx, tr.gy);
      const dx = Math.cos(a.angle), dy = Math.sin(a.angle);
      const sx = cx + dx * BALL_R * ZOOM, sy = cy + dy * BALL_R * ZOOM;
      ctx.save();
      ctx.setLineDash([3, 2.5]);
      line(ctx, sx, sy, gx - dx * BALL_R * ZOOM * (tr.hit ? 1 : 0), gy - dy * BALL_R * ZOOM * (tr.hit ? 1 : 0), [255, 255, 255], 0.9);
      ctx.restore();
      strokeCircle(ctx, gx, gy, BALL_R * ZOOM, [255, 255, 255], 0.9);
      if (tr.hit) {
        const o = v.balls[tr.hit];
        const [ox, oy] = toScreen(o.x, o.y);
        const col: RGB = [255, 240, 180];
        line(ctx, ox, oy, ox + tr.ox * 34 * ZOOM, oy + tr.oy * 34 * ZOOM, col, 0.9);
        // Salida de la blanca: la rosca la empuja hacia delante (sigue) o hacia atrás (retrocede).
        const dx = Math.cos(a.angle), dy = Math.sin(a.angle);
        const dot = dx * tr.ox + dy * tr.oy;
        let wx = dx - tr.ox * dot + dx * a.top * FOLLOW_K * dot, wy = dy - tr.oy * dot + dy * a.top * FOLLOW_K * dot;
        const wl = Math.hypot(wx, wy);
        if (wl > 0.05) {
          wx /= wl;
          wy /= wl;
          const len = (12 + Math.min(1, wl) * 12) * ZOOM;
          line(ctx, gx, gy, gx + wx * len, gy + wy * len, [255, 255, 255], 0.6);
        }
      }
    }
    // Tronera marcada para la 8.
    if (v.left[v.turn] === 0 && v.groups[v.turn] >= 0) {
      const p = a.call >= 0 ? a.call : bestPocket(v.balls, tr);
      const [px, py] = toScreen(POCKETS[p][0], POCKETS[p][1]);
      const blink = Math.floor(this.time * 3) % 2 === 0;
      strokeCircle(ctx, px, py, (p === 1 || p === 4 ? SIDE_R : CORNER_R) * ZOOM + 1.5, blink ? [255, 230, 90] : [255, 150, 60], 1.4);
    }
    this.drawStick(ctx, cx, cy, a.angle, pull);
  }

  /** Taco visto desde arriba: punta, virola, caña y mango, con sombra. */
  private drawStick(ctx: Ctx, cx: number, cy: number, angle: number, pull: number) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const nx = -dy, ny = dx;
    const start = (BALL_R + 1.5 + pull) * ZOOM;
    const parts: [number, number, number, number, RGB][] = [
      // [desde, hasta, ancho en la punta, ancho al final, color] (distancias en unidades del juego)
      [0, 2, 1.3, 1.4, [90, 150, 230]],
      [2, 6, 1.4, 1.5, [245, 245, 240]],
      [6, 98, 1.5, 2.3, [226, 188, 130]],
      [98, 150, 2.3, 3.1, [70, 40, 22]],
    ];
    for (const shadow of [true, false]) {
      for (const [a, b, w0, w1, col] of parts) {
        const p0 = start + a * ZOOM, p1 = start + b * ZOOM;
        const o = shadow ? 2 : 0;
        const ax = cx - dx * p0 + o, ay = cy - dy * p0 + o, bx = cx - dx * p1 + o, by = cy - dy * p1 + o;
        const pts: [number, number][] = [
          [ax + nx * w0, ay + ny * w0], [bx + nx * w1, by + ny * w1], [bx - nx * w1, by - ny * w1], [ax - nx * w0, ay - ny * w0],
        ];
        ctx.fillStyle = shadow ? "rgba(0,0,0,0.28)" : css(col);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // --- HUD ---
  private pip(ctx: Ctx, x: number, y: number, id: number, on: boolean) {
    const r = 3.4;
    if (!on) {
      strokeCircle(ctx, x, y, r - 0.4, [90, 90, 110], 0.8);
      return;
    }
    fillCircle(ctx, x, y, r, id > 8 ? [244, 244, 238] : hexRgb(BALL_COLORS[id]));
    if (id > 8) {
      ctx.fillStyle = css(hexRgb(BALL_COLORS[id - 8]));
      ctx.fillRect(x - r, y - 1.2, r * 2, 2.4);
    }
    strokeCircle(ctx, x, y, r, [0, 0, 0], 0.6);
  }

  private playerPanel(ctx: Ctx, v: PoolView, p: number, x: number) {
    const active = v.turn % 2 === p && v.phase !== 2;
    const color = PLAYER_COLORS[p];
    const four = v.names.length === 4;
    const shooter = v.shooters[p];
    panel(ctx, x, 2, 128, 29, active ? C_GOLD : C_MUTE, 0.85);
    // En dobles, una chapa por compañero; la del que tira ahora, más grande.
    const seats = four ? [p, p + 2] : [p];
    seats.forEach((s, i) => badge(ctx, x + 9 + i * 11, 11, s === shooter ? 5 : 3.6, color, String(s + 1)));
    const nx = x + 17 + (four ? 11 : 0);
    const label = fitText(ctx, v.names[shooter] + (shooter === v.me ? " (tú)" : ""), 108 - (nx - x) + 8 - 24, TINY);
    shadowText(ctx, label, nx, 7, active ? [255, 255, 255] : [190, 190, 205], TINY);
    shadowText(ctx, `★${v.wins[p] ?? 0}`, x + 123, 7, C_GOLD, TINY, "right");
    // Bolas de su grupo: apagadas las que ya cayeron; hasta que haya grupos, siete huecos.
    const g = v.groups[p];
    for (let i = 0; i < 7; i++) {
      const id = g < 0 ? 0 : g === 0 ? i + 1 : i + 9;
      const on = g >= 0 && v.balls[id].pocket < 0;
      if (g < 0) strokeCircle(ctx, x + 9 + i * 11, 23, 3, [70, 70, 90], 0.8);
      else this.pip(ctx, x + 9 + i * 11, 23, id, on);
    }
    this.pip(ctx, x + 9 + 7 * 11 + 3, 23, 8, v.balls[8].pocket < 0);
    if (v.phase === 0 && v.turn === shooter && v.ai[shooter]) shadowText(ctx, "...", x + 100, 7, C_GOLD, TINY);
  }

  private drawHud(ctx: Ctx, v: PoolView) {
    hudStrip(ctx, PW, 33);
    this.playerPanel(ctx, v, 0, 22);
    this.playerPanel(ctx, v, 1, 186);
    // Reloj del turno entre los dos jugadores.
    const left = Math.max(0, Math.ceil(v.timer));
    const low = v.phase === 0 && left <= 10;
    panel(ctx, 155, 6, 26, 21, low ? C_LOSE : C_GOLD, 0.85);
    titleText(ctx, v.phase === 0 ? String(Math.min(SHOT_TIME, left)) : "-", 168, 16.5, low ? [255, 120, 100] : [255, 255, 255], "10px", "center", "middle");

    // Barra de potencia (se arrastra hacia abajo y se suelta).
    const active = v.mine && v.phase === 0 && !v.placing;
    panel(ctx, BAR.x - 1, BAR.y - 1, BAR.w + 2, BAR.h + 2, active ? C_GOLD : C_MUTE, 0.85);
    const segs = 14, sh = BAR.h / segs;
    for (let i = 0; i < segs; i++) {
      const on = (i + 1) / segs <= v.aim.power + 1e-6 || (i / segs < v.aim.power && v.aim.power > 0);
      const k = i / (segs - 1);
      const col: RGB = k < 0.5 ? [90 + k * 2 * 150, 220, 90] : [240, 220 - (k - 0.5) * 2 * 150, 70];
      ctx.fillStyle = on ? css(col, active ? 1 : 0.55) : "rgba(255,255,255,0.1)";
      ctx.fillRect(BAR.x + 1, BAR.y + i * sh + 0.5, BAR.w - 2, sh - 1);
    }
    const ky = BAR.y + BAR.h * v.aim.power;
    ctx.fillStyle = active ? "#fff" : "#9a9ab0";
    ctx.fillRect(BAR.x - 2, ky - 1.2, BAR.w + 4, 2.4);
    text(ctx, "POT", BAR.x + BAR.w / 2 + 0.5, BAR.y - 9, C_DIM, "6px", "center");

    // Bola de efecto.
    text(ctx, "EFE", SPIN.x + 0.5, SPIN.y - SPIN.r - 8, C_DIM, "6px", "center");
    fillCircle(ctx, SPIN.x, SPIN.y, SPIN.r, [244, 244, 238]);
    strokeCircle(ctx, SPIN.x, SPIN.y, SPIN.r, active ? C_GOLD : C_MUTE, 1.2);
    line(ctx, SPIN.x - SPIN.r + 2, SPIN.y, SPIN.x + SPIN.r - 2, SPIN.y, [200, 200, 195], 0.5);
    line(ctx, SPIN.x, SPIN.y - SPIN.r + 2, SPIN.x, SPIN.y + SPIN.r - 2, [200, 200, 195], 0.5);
    fillCircle(ctx, SPIN.x + v.aim.side * (SPIN.r - 2.2), SPIN.y - v.aim.top * (SPIN.r - 2.2), 2.2, [210, 30, 30]);

    // Mensaje / ayuda.
    if (v.netLabel) shadowText(ctx, v.netLabel, PW - 4, PH - 19, C_DIM, TINY, "right");
    const msg = v.msg || v.footer;
    if (msg && v.phase !== 2) {
      shadowText(ctx, fitText(ctx, msg, PW - 40, TINY), PW / 2 + 8, PH - 10, v.msg ? C_GOLD : C_TEXT, TINY, "center");
    }
    if (v.phase === 2) this.drawResult(ctx, v);
  }

  private drawResult(ctx: Ctx, v: PoolView) {
    const w = v.winner;
    panel(ctx, 52, 70, 232, 62, C_LINE, 0.9);
    const who = v.names.length === 4 ? `EQUIPO ${w + 1}` : v.names[w].toUpperCase();
    titleText(ctx, `¡GANA ${who}!`, 168, 76, PLAYER_COLORS[w], MID);
    const reason = v.msg.includes(":") ? v.msg.slice(v.msg.indexOf(":") + 1).trim() : v.msg;
    text(ctx, fitText(ctx, reason, 216, TINY), 168, 96, C_TEXT, TINY, "center");
    text(ctx, `★ ${v.wins[0] ?? 0} - ${v.wins[1] ?? 0}`, 168, 108, C_GOLD, SMALL, "center");
    const lit = Math.floor(this.time * 2) % 2 === 0;
    text(ctx, fitText(ctx, v.footer, 222, TINY), 168, 120, lit ? C_TEXT : C_MUTE, TINY, "center");
  }
}

function hexRgb(n: number): RGB {
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
