import { BombBag, Movement, Player, PowerUpKind } from "../components";
import {
  HUD_BG, HUD_HEIGHT, HUD_LINE, PLAYER_BASE_SPEED, PLAYER_COLORS, PLAYER_NAMES, PLAYER_SPEED_STEP, SCREEN_H, SCREEN_W,
  TEXT_COLOR, TEXT_DIM, type RGB,
} from "../config";
import type { Entity, World } from "../ecs";
import { badge, fillRect, fitText, fitTitle, line, panel, shadowText, text, textWidth, titleText, type Ctx } from "../../core/draw";
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
    // Filete de neón bajo el marcador, a trozos como en las recreativas.
    ctx.fillStyle = "rgb(255,61,139)";
    for (let x = 0; x < SCREEN_W; x += 16) ctx.fillRect(x, HUD_HEIGHT - 4, 10, 3);
    line(ctx, 0, HUD_HEIGHT - 1, SCREEN_W, HUD_HEIGHT - 1, HUD_LINE, 2);

    const layout = playerIds.length > 2 ? COMPACT : WIDE;
    playerIds.forEach((e, i) => this.playerPanel(ctx, world, e, i, 8 + i * layout.width, layout, i === localIndex));

    const info = world.mapInfo;
    const lines = [`Semilla ${info.seed}`, `Simetría: ${info.symmetry}`, `Enemigos: ${enemiesLeft}`];
    lines.forEach((str, j) => shadowText(ctx, str, SCREEN_W - 10, 4 + j * 16, j < 2 ? TEXT_DIM : TEXT_COLOR, SMALL, "right"));
  }

  private playerPanel(
    ctx: Ctx, world: World, e: Entity, i: number, x: number, layout: typeof WIDE, isLocal: boolean,
  ) {
    const color = PLAYER_COLORS[i];
    const cy = HUD_HEIGHT / 2 - 2;
    const r = layout === WIDE ? 11 : 9;
    panel(ctx, x - 4, 3, layout.width - 6, HUD_HEIGHT - 10, isLocal ? color : HUD_LINE, isLocal ? 0.5 : 0.35, [0, 0, 0], 2);
    // Número del jugador: identifica también en escala de grises.
    badge(ctx, x + r + 2, cy, r, color, String(i + 1));
    const player = world.get(e, Player);
    const mov = world.get(e, Movement);
    const bag = world.get(e, BombBag);
    // El nombre se lee al dibujar: en red puede llegar después de empezar la ronda.
    const name = (PLAYER_NAMES[i] ?? player?.name ?? `Jugador ${i + 1}`) + (isLocal ? " (tú)" : "");
    shadowText(ctx, fitText(ctx, name, layout.width - layout.statX - 12, layout.nameFont), x + layout.statX, layout.nameY, color, layout.nameFont);
    if (!player || !player.alive || !mov || !bag) {
      shadowText(ctx, "K.O.", x + layout.statX, layout.statY, [255, 80, 80], layout.statFont);
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
      shadowText(ctx, value, ix + layout.icon + 1, layout.statY, TEXT_COLOR, layout.statFont);
      ix += layout.step;
    }
  }

  /** Etiqueta discreta del tipo de conexión, en la esquina inferior derecha del mapa. */
  drawNetLabel(ctx: Ctx, label: string) {
    const w = textWidth(ctx, label, SMALL) + 14;
    panel(ctx, SCREEN_W - w - 6, SCREEN_H - 27, w, 22, HUD_LINE, 0.55, [0, 0, 0], 2);
    text(ctx, label, SCREEN_W - 13, SCREEN_H - 16, TEXT_DIM, SMALL, "right", "middle");
  }

  drawHint(ctx: Ctx, hint: string, alpha: number) {
    ctx.globalAlpha = alpha;
    panel(ctx, -4, SCREEN_H - 32, SCREEN_W + 8, 28, [255, 207, 80], 0.7, [0, 0, 0], 2);
    shadowText(ctx, fitText(ctx, hint, SCREEN_W - 16, SMALL), SCREEN_W / 2, SCREEN_H - 18, TEXT_COLOR, SMALL, "center", "middle");
    ctx.globalAlpha = 1;
  }

  drawOverlay(ctx: Ctx, title: string, color: RGB, subtitle: string) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, HUD_HEIGHT, SCREEN_W, SCREEN_H - HUD_HEIGHT);
    const midY = HUD_HEIGHT + (SCREEN_H - HUD_HEIGHT) / 2;
    panel(ctx, -4, midY - 62, SCREEN_W + 8, 120, color, 0.55, [0, 0, 0], 3);
    titleText(ctx, fitTitle(ctx, title, SCREEN_W - 24, BIG), SCREEN_W / 2, midY - 20, color, BIG, "center", "middle");
    // El subtítulo parpadea como un "PULSA START".
    const lit = Math.floor(performance.now() / 500) % 2 === 0;
    shadowText(ctx, fitText(ctx, subtitle, SCREEN_W - 24, MID), SCREEN_W / 2, midY + 30, lit ? TEXT_COLOR : TEXT_DIM, MID, "center", "middle");
  }
}
