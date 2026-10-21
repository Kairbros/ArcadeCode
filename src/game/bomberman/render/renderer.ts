import {
  Bomb, Burning, Dying, Enemy, Explosion, FloatingText, GridCell, Lifetime, Movement, Player, PowerUp, PowerUpKind,
  Sprite, Transform, Wall, type Dir, type ExplosionShape, type SpriteKind,
} from "../components";
import {
  BOMB_FUSE, CRATE_BASE, CRATE_BURN_TIME, CRATE_DARK, CRATE_LIGHT, DEATH_TIME, FIRE_CORE, FIRE_MID, FIRE_OUTER,
  FLOOR_A, FLOOR_B, FLOOR_SHADOW, FLOOR_TUFT, HUD_HEIGHT, TILE, WALL_BASE, WALL_DARK, WALL_LIGHT, type RGB,
} from "../config";
import type { Entity, World } from "../ecs";
import { Rng } from "../../core/rng";
import { settings } from "../../core/settings";
import {
  css, fillCircle, fillEllipse, fillRect, line, roundRect, shade, strokeEllipse, strokeRect,
  text, titleText, type Ctx,
} from "../../core/draw";
import { drawIcon } from "./icons";

const ICON_COLORS: Record<PowerUpKind, RGB> = {
  [PowerUpKind.Speed]: [60, 170, 240],
  [PowerUpKind.Range]: [240, 120, 40],
  [PowerUpKind.Bombs]: [120, 120, 150],
};

type DrawFn = (world: World, ctx: Ctx, e: Entity, spr: Sprite, x: number, y: number) => void;

/** Dibuja el mundo. Cada Sprite.kind tiene su función de dibujo. */
export class Renderer {
  time = 0;
  private floor: HTMLCanvasElement | null = null;
  private floorScale = 0;

  private readonly drawers: Record<SpriteKind, DrawFn> = {
    wall: (w, c, e, s, x, y) => this.drawWall(c, x, y),
    crate: (w, c, e, s, x, y) => this.drawCrate(w, c, e, x, y),
    bomb: (w, c, e, s, x, y) => this.drawBomb(w, c, e, x, y),
    explosion: (w, c, e, s, x, y) => this.drawExplosion(w, c, e, x, y),
    powerup: (w, c, e, s, x, y) => this.drawPowerUp(w, c, e, x, y),
    player: (w, c, e, s, x, y) => this.drawPlayer(w, c, e, s, x, y),
    enemy: (w, c, e, s, x, y) => this.drawEnemy(w, c, e, s, x, y),
    text: (w, c, e, s, x, y) => this.drawText(w, c, e, x, y),
  };

  reset() {
    this.floor = null;
  }

  update(dt: number) {
    this.time += dt;
  }

  /** pixelScale: píxeles reales por unidad lógica (para cachear el suelo nítido). */
  draw(world: World, ctx: Ctx, pixelScale: number) {
    if (!this.floor || this.floorScale !== pixelScale) {
      this.floor = this.buildFloor(world, pixelScale);
      this.floorScale = pixelScale;
    }
    const info = world.mapInfo;
    ctx.drawImage(this.floor, 0, HUD_HEIGHT, info.cols * TILE, info.rows * TILE);

    const items: [number, number, Entity, Sprite, number][] = [];
    for (const [e, spr] of world.query(Sprite)) {
      const gc = world.get(e, GridCell);
      let x: number;
      let y: number;
      if (gc) {
        x = (gc.col + 0.5) * TILE;
        y = (gc.row + 0.5) * TILE;
      } else {
        const t = world.get(e, Transform);
        if (!t) continue;
        x = t.x;
        y = t.y;
      }
      items.push([spr.layer, y, e, spr, x]);
    }
    items.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, y, e, spr, x] of items) this.drawers[spr.kind](world, ctx, e, spr, x, y + HUD_HEIGHT);
  }

  // --- fondo estático ---
  private buildFloor(world: World, scale: number): HTMLCanvasElement {
    const info = world.mapInfo;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(info.cols * TILE * scale);
    canvas.height = Math.ceil(info.rows * TILE * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    const rng = new Rng(info.seed);
    for (let r = 0; r < info.rows; r++) {
      for (let c = 0; c < info.cols; c++) {
        const x = c * TILE;
        const y = r * TILE;
        fillRect(ctx, x, y, TILE, TILE, (c + r) % 2 === 0 ? FLOOR_A : FLOOR_B);
        const tufts = Math.floor(rng.next() * 4);
        for (let i = 0; i < tufts; i++) {
          const tx = x + 6 + Math.floor(rng.next() * (TILE - 12));
          const ty = y + 6 + Math.floor(rng.next() * (TILE - 12));
          line(ctx, tx, ty, tx + (rng.next() < 0.5 ? -2 : 2), ty - 4, FLOOR_TUFT, 2);
        }
      }
    }
    for (const [, , cell] of world.query(Wall, GridCell)) {
      ctx.fillStyle = "rgba(0,0,0,0.27)";
      ctx.fillRect(cell.col * TILE, (cell.row + 1) * TILE, TILE, TILE / 4);
    }
    return canvas;
  }

  // --- sprites ---
  private drawWall(ctx: Ctx, x: number, y: number) {
    const l = x - TILE / 2;
    const t = y - TILE / 2;
    fillRect(ctx, l, t, TILE, TILE, WALL_DARK);
    const tl = l + 1;
    const tt = t + 1;
    const s = TILE - 4;
    fillRect(ctx, tl, tt, s, s, WALL_BASE);
    line(ctx, tl, tt, tl + s, tt, WALL_LIGHT, 3);
    line(ctx, tl, tt, tl, tt + s, WALL_LIGHT, 3);
    line(ctx, tl, tt + s / 2, tl + s, tt + s / 2, WALL_DARK, 2);
    line(ctx, tl + s / 2, tt, tl + s / 2, tt + s / 2, WALL_DARK, 2);
  }

  private drawCrate(world: World, ctx: Ctx, e: Entity, x: number, y: number) {
    const burn = world.get(e, Burning);
    let s = TILE - 4;
    if (burn) {
      const f = Math.max(0, burn.timer / CRATE_BURN_TIME);
      s -= (1 - f) * TILE * 0.6;
      const color = Math.floor(this.time * 20) % 2 ? FIRE_OUTER : FIRE_MID;
      roundRect(ctx, x - s / 2, y - s / 2, s, s, 4, color, CRATE_DARK, 2);
      return;
    }
    const l = x - s / 2;
    const t = y - s / 2;
    fillRect(ctx, l + 3, t + 4, s, s, FLOOR_SHADOW);
    fillRect(ctx, l, t, s, s, CRATE_BASE);
    strokeRect(ctx, l, t, s, s, CRATE_DARK, 3);
    line(ctx, l + 4, t + 4, l + s - 5, t + 4, CRATE_LIGHT, 2);
    line(ctx, l + 3, t + s - 4, l + s - 4, t + 3, CRATE_DARK, 3);
    line(ctx, l, t + s / 3, l + s - 1, t + s / 3, CRATE_DARK, 2);
    line(ctx, l, t + (2 * s) / 3, l + s - 1, t + (2 * s) / 3, CRATE_DARK, 2);
  }

  private drawBomb(world: World, ctx: Ctx, e: Entity, x: number, y: number) {
    const bomb = world.get(e, Bomb)!;
    const urgency = 1 - Math.max(0, bomb.timer) / BOMB_FUSE;
    const pulse = 1 + 0.09 * Math.sin(this.time * (5 + 16 * urgency));
    const rad = TILE * 0.32 * pulse;
    const flashing = bomb.timer < 0.6 && Math.floor(this.time * 16) % 2 === 1;
    const body: RGB = flashing ? [200, 40, 40] : [30, 30, 36];
    fillEllipse(ctx, x - rad, y + rad * 0.6, rad * 2, rad * 0.7, "rgba(0,0,0,0.45)");
    fillCircle(ctx, x, y, rad, body);
    fillCircle(ctx, x - rad * 0.35, y - rad * 0.35, rad * 0.25, [110, 110, 130]);
    const fx = x + rad * 0.8;
    const fy = y - rad * 1.15;
    line(ctx, x + rad * 0.45, y - rad * 0.8, fx, fy, [200, 170, 120], 3);
    const spark: RGB = Math.floor(this.time * 24) % 2 ? [255, 230, 80] : [255, 120, 30];
    fillCircle(ctx, fx, fy, 3 + 2 * Math.abs(Math.sin(this.time * 30)), spark);
  }

  private drawExplosion(world: World, ctx: Ctx, e: Entity, x: number, y: number) {
    const ex = world.get(e, Explosion)!;
    const lt = world.get(e, Lifetime)!;
    const p = 1 - Math.max(0, lt.remaining) / ex.duration; // 0 -> 1
    const k = Math.min(1, p * 5) * (1 - Math.max(0, (p - 0.55) / 0.45)); // crece rápido, se apaga despacio
    const base = TILE * 0.9 * Math.max(0.15, k);
    const layers: [number, RGB][] = [[1, FIRE_OUTER], [0.66, FIRE_MID], [0.33, FIRE_CORE]];
    for (const [frac, color] of layers) flame(ctx, ex.shape, ex.direction, x, y, Math.max(2, base * frac), color);
  }

  private drawPowerUp(world: World, ctx: Ctx, e: Entity, x: number, y: number) {
    const pu = world.get(e, PowerUp)!;
    const bob = Math.sin(this.time * 4 + e) * 3;
    const size = TILE * 0.72;
    const l = x - size / 2;
    const t = y + bob - size / 2;
    roundRect(ctx, l + 2, t + 3, size, size, 8, [0, 0, 0]);
    roundRect(ctx, l, t, size, size, 8, ICON_COLORS[pu.kind]);
    const border: RGB = Math.floor(this.time * 3) % 2 ? [255, 255, 255] : [200, 200, 210];
    roundRect(ctx, l, t, size, size, 8, undefined, border, 2);
    drawIcon(ctx, pu.kind, x, y + bob, size * 0.85);
  }

  private drawPlayer(world: World, ctx: Ctx, e: Entity, spr: Sprite, x: number, y: number) {
    const mov = world.get(e, Movement)!;
    const dying = world.get(e, Dying);
    let scale = 1;
    let color = spr.color;
    if (dying) {
      scale = Math.max(0.05, dying.timer / DEATH_TIME);
      if (Math.floor(this.time * 18) % 2) color = [255, 255, 255];
    }
    const bob = mov.moving ? Math.abs(Math.sin(this.time * 14)) * 3 : 0;
    const rad = TILE * 0.36 * scale;
    const cy = y - bob;
    fillEllipse(ctx, x - rad, y + rad * 0.65, rad * 2, rad * 0.6, "rgba(0,0,0,0.45)");
    // Poroto del casino: piececitos, cuerpo de cápsula, guantes, ojos saltones, nariz y bombín.
    const dark: RGB = [42, 14, 28], cream: RGB = [255, 244, 222];
    const [fx, fy] = mov.facing;
    const step = mov.moving ? Math.sin(this.time * 14) * rad * 0.25 : 0;
    for (const side of [-1, 1]) fillEllipse(ctx, x + side * rad * 0.42 - rad * 0.3, cy + rad * 0.78 + step * side, rad * 0.6, rad * 0.4, dark);
    roundRect(ctx, x - rad * 0.85, cy - rad * 0.85, rad * 1.7, rad * 1.85, rad * 0.85, color, shade(color, 0.6), 2);
    for (const side of [-1, 1]) {
      fillCircle(ctx, x + side * rad * 1.02, cy + rad * 0.2 - step * side * 0.6, rad * 0.26, cream);
    }
    const faceX = x + fx * rad * 0.12;
    const faceY = cy - rad * 0.3 + fy * rad * 0.1;
    for (const side of [-1, 1]) {
      const ex = faceX + side * rad * 0.31;
      fillEllipse(ctx, ex - rad * 0.24, faceY - rad * 0.3, rad * 0.48, rad * 0.6, [255, 255, 255]);
      fillCircle(ctx, ex + fx * rad * 0.1, faceY + fy * rad * 0.12, Math.max(1, rad * 0.12), [20, 16, 24]);
    }
    fillCircle(ctx, faceX, faceY + rad * 0.42, Math.max(1, rad * 0.13), [255, 122, 138]);
    // Bombín oscuro con cinta clara.
    fillEllipse(ctx, x - rad * 0.95, cy - rad * 1.0, rad * 1.9, rad * 0.4, dark);
    roundRect(ctx, x - rad * 0.55, cy - rad * 1.5, rad * 1.1, rad * 0.7, rad * 0.3, dark);
    fillRect(ctx, x - rad * 0.55, cy - rad * 0.95, rad * 1.1, Math.max(1, rad * 0.12), cream);
    // En escala de grises los colores no distinguen a los jugadores: se muestra su número.
    const player = world.get(e, Player);
    if (settings.grayscale && player && !dying) {
      const label = String(player.index + 1);
      const ly = cy - rad * 1.5 - 8;
      titleText(ctx, label, x, ly, [255, 255, 255], "16px", "center", "middle");
    }
  }

  private drawEnemy(world: World, ctx: Ctx, e: Entity, spr: Sprite, x: number, y: number) {
    const en = world.get(e, Enemy)!;
    const dying = world.get(e, Dying);
    const scale = dying ? Math.max(0.05, dying.timer / DEATH_TIME) : 1;
    const wob = Math.sin(this.time * 10 + e) * 2;
    const w = TILE * 0.72 * scale;
    const h = (TILE * 0.66 + wob) * scale;
    fillEllipse(ctx, x - w / 2, y + h * 0.3, w, h * 0.35, "rgba(0,0,0,0.45)");
    const color: RGB = dying && Math.floor(this.time * 18) % 2 ? [255, 255, 255] : spr.color;
    fillEllipse(ctx, x - w / 2, y - h / 2, w, h, color);
    strokeEllipse(ctx, x - w / 2, y - h / 2, w, h, shade(spr.color, 0.55), 2);
    for (const side of [-1, 1]) {
      const ex = x + side * w * 0.18;
      const ey = y - h * 0.08;
      fillCircle(ctx, ex, ey, Math.max(1, w * 0.12), [255, 255, 255]);
      fillCircle(ctx, ex + en.dx * w * 0.05, ey + en.dy * w * 0.05, Math.max(1, w * 0.06), [20, 0, 30]);
      line(ctx, ex - side * w * 0.12, ey - h * 0.2, ex + side * w * 0.08, ey - h * 0.12, [40, 0, 50], 2);
    }
  }

  private drawText(world: World, ctx: Ctx, e: Entity, x: number, y: number) {
    const ft = world.get(e, FloatingText)!;
    const lt = world.get(e, Lifetime)!;
    ctx.globalAlpha = Math.max(0, Math.min(1, lt.remaining / (ft.duration * 0.5)));
    const font = "bold 15px Arial, sans-serif";
    text(ctx, ft.text, x + 1, y + 1, [0, 0, 0], font, "center", "middle");
    text(ctx, ft.text, x, y, ft.color, font, "center", "middle");
    ctx.globalAlpha = 1;
  }
}

function flame(ctx: Ctx, shape: ExplosionShape, [dx, dy]: Dir, x: number, y: number, w: number, color: RGB) {
  const half = TILE / 2;
  ctx.fillStyle = css(color);
  if (shape === "center") {
    ctx.fillRect(x - half, y - w / 2, TILE, w);
    ctx.fillRect(x - w / 2, y - half, w, TILE);
    fillCircle(ctx, x, y, w * 0.62, color);
  } else if (shape === "arm") {
    if (dx) ctx.fillRect(x - half, y - w / 2, TILE, w);
    else ctx.fillRect(x - w / 2, y - half, w, TILE);
  } else {
    // end: del borde que mira a la bomba hasta el centro, con punta redonda
    if (dx) ctx.fillRect(dx > 0 ? x - half : x, y - w / 2, half, w);
    else ctx.fillRect(x - w / 2, dy > 0 ? y - half : y, w, half);
    fillCircle(ctx, x, y, w / 2, color);
  }
}
