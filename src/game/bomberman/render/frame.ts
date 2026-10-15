// Dibujo de un frame completo. Lo usan el juego local/anfitrión y el invitado (que no simula).
import { Dying, Enemy } from "../components";
import { BG_COLOR, HINT_TIME, SCREEN_H, SCREEN_W, type RGB } from "../config";
import type { Entity, World } from "../ecs";
import { css } from "../../core/draw";
import type { Hud } from "./hud";
import type { Renderer } from "./renderer";

export interface GameView {
  world: World;
  playerIds: Entity[];
  roundTime: number;
  over: boolean;
  result: [string, RGB] | null;
  paused: boolean;
  hint: string;
  overSubtitle: string;
  /** Índice del jugador de esta pantalla (se resalta en el HUD), o null en local. */
  localIndex: number | null;
  /** Tipo de conexión en red ("Conexión directa", "Conexión vía Vercel"...). Vacío en local. */
  netLabel: string;
}

export function enemiesLeft(world: World): number {
  return world.query(Enemy).filter(([e]) => !world.has(e, Dying)).length;
}

export function drawGame(ctx: CanvasRenderingContext2D, pixelScale: number, view: GameView, renderer: Renderer, hud: Hud) {
  ctx.fillStyle = css(BG_COLOR);
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  renderer.draw(view.world, ctx, pixelScale);
  hud.draw(ctx, view.world, view.playerIds, enemiesLeft(view.world), view.localIndex);
  if (view.netLabel) hud.drawNetLabel(ctx, view.netLabel);
  if (view.roundTime < HINT_TIME) hud.drawHint(ctx, view.hint, Math.min(1, (HINT_TIME - view.roundTime) / 1.5));
  if (view.over && view.result) {
    const [title, color] = view.result;
    hud.drawOverlay(ctx, title, color, view.overSubtitle);
  } else if (view.paused) {
    hud.drawOverlay(ctx, "PAUSA", [235, 235, 245], view.localIndex ? "Esperando al anfitrión" : "P para continuar");
  }
}
