import { BombBag, Movement, Player, PowerUpKind } from "../components";
import {
  HUD_BG, HUD_HEIGHT, HUD_LINE, PLAYER_BASE_SPEED, PLAYER_COLORS, PLAYER_NAMES, PLAYER_SPEED_STEP, SCREEN_H, SCREEN_W,
  TEXT_COLOR, TEXT_DIM, type RGB,
} from "../config";
import type { Entity, World } from "../ecs";
import { fillCircle, fillRect, line, text, type Ctx } from "../../core/draw";
import { drawIcon } from "./icons";

const FONT = "bold 16px Arial, sans-serif";
const SMALL = "bold 13px Arial, sans-serif";
const MID = "bold 20px Arial, sans-serif";
const BIG = "bold 46px Arial, sans-serif";

// Con 3-4 jugadores los paneles se compactan para caber en el ancho.
const WIDE = { width: 235, nameFont: FONT, statFont: FONT, icon: 20, step: 62, statX: 32, nameY: 5, statY: 30, iconY: 38 };
const COMPACT = { width: 142, nameFont: SMALL, statFont: SMALL, icon: 16, step: 38, statX: 26, nameY: 7, statY: 31, iconY: 38 };

export class Hud {
  draw(ctx: Ctx, world: World, playerIds: Entity[], enemiesLeft: number, localIndex: number | null) {
    fillRect(ctx, 0, 0, SCREEN_W, HUD_HEIGHT, HUD_BG);
    line(ctx, 0, HUD_HEIGHT - 1, SCREEN_W, HUD_HEIGHT - 1, HUD_LINE, 2);

    const layout = playerIds.length > 2 ? COMPACT : WIDE;
    playerIds.forEach((e, i) => this.playerPanel(ctx, world, e, i, 8 + i * layout.width, layout, i === localIndex));

    const info = world.mapInfo;
    const lines = [`Semilla ${info.seed}`, `Simetría: ${info.symmetry}`, `Enemigos: ${enemiesLeft}`];
    lines.forEach((str, j) => text(ctx, str, SCREEN_W - 10, 5 + j * 16, j < 2 ? TEXT_DIM : TEXT_COLOR, SMALL, "right"));
  }

  private playerPanel(
    ctx: Ctx, world: World, e: Entity, i: number, x: number, layout: typeof WIDE, isLocal: boolean,
  ) {
    const color = PLAYER_COLORS[i];
    const cy = HUD_HEIGHT / 2;
    const r = layout === WIDE ? 11 : 9;
    if (isLocal) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(x - 4, 3, layout.width - 6, HUD_HEIGHT - 8);
    }
    fillCircle(ctx, x + r + 2, cy, r, color);
    // Número del jugador: identifica también en escala de grises.
    text(ctx, String(i + 1), x + r + 2, cy + 1, [0, 0, 0], `bold ${r + 3}px Arial, sans-serif`, "center", "middle");
    const player = world.get(e, Player);
    const mov = world.get(e, Movement);
    const bag = world.get(e, BombBag);
    // El nombre se lee al dibujar: en red puede llegar después de empezar la ronda.
    const name = (PLAYER_NAMES[i] ?? player?.name ?? `Jugador ${i + 1}`) + (isLocal ? " (tú)" : "");
    text(ctx, name, x + layout.statX, layout.nameY, color, layout.nameFont);
    if (!player || !player.alive || !mov || !bag) {
      text(ctx, "K.O.", x + layout.statX, layout.statY, [255, 80, 80], layout.statFont);
      return;
    }
    const speedLvl = Math.round((mov.speed - PLAYER_BASE_SPEED) / PLAYER_SPEED_STEP) + 1;
    const stats: [PowerUpKind, string][] = [
      [PowerUpKind.Speed, String(speedLvl)],
      [PowerUpKind.Range, String(bag.range)],
      [PowerUpKind.Bombs, `${bag.capacity - bag.active}/${bag.capacity}`],
    ];
    let ix = x + layout.statX;
    for (const [kind, value] of stats) {
      drawIcon(ctx, kind, ix + layout.icon / 2 - 1, layout.iconY, layout.icon);
      text(ctx, value, ix + layout.icon + 1, layout.statY, TEXT_COLOR, layout.statFont);
      ix += layout.step;
    }
  }

  /** Etiqueta discreta del tipo de conexión, en la esquina inferior derecha del mapa. */
  drawNetLabel(ctx: Ctx, label: string) {
    ctx.font = SMALL;
    const w = ctx.measureText(label).width + 12;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(SCREEN_W - w - 6, SCREEN_H - 26, w, 20);
    text(ctx, label, SCREEN_W - 12, SCREEN_H - 16, TEXT_DIM, SMALL, "right", "middle");
  }

  drawHint(ctx: Ctx, hint: string, alpha: number) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, SCREEN_H - 30, SCREEN_W, 26);
    text(ctx, hint, SCREEN_W / 2, SCREEN_H - 17, TEXT_COLOR, SMALL, "center", "middle");
    ctx.globalAlpha = 1;
  }

  drawOverlay(ctx: Ctx, title: string, color: RGB, subtitle: string) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, HUD_HEIGHT, SCREEN_W, SCREEN_H - HUD_HEIGHT);
    const midY = HUD_HEIGHT + (SCREEN_H - HUD_HEIGHT) / 2;
    text(ctx, title, SCREEN_W / 2 + 3, midY - 17, [0, 0, 0], BIG, "center", "middle");
    text(ctx, title, SCREEN_W / 2, midY - 20, color, BIG, "center", "middle");
    text(ctx, subtitle, SCREEN_W / 2, midY + 30, TEXT_COLOR, MID, "center", "middle");
  }
}
