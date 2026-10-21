// Iconos de los buffs de Bomberman (en el suelo y en el HUD).
import { fillCircle, line, polygon, type Ctx } from "../../core/draw";
import { PowerUpKind } from "../components";

/** Icono vectorial de un buff, centrado en (cx, cy), de tamaño s. */
export function drawIcon(ctx: Ctx, kind: PowerUpKind, cx: number, cy: number, s: number) {
  const scaled = (pts: [number, number][], k = 1, dy = 0): [number, number][] =>
    pts.map(([px, py]) => [cx + px * s * k, cy + (py * k + dy) * s]);
  if (kind === PowerUpKind.Speed) {
    const bolt: [number, number][] = [[0.12, -0.5], [-0.28, 0.06], [-0.02, 0.06], [-0.14, 0.5], [0.28, -0.08], [0.02, -0.08]];
    polygon(ctx, scaled(bolt), [255, 240, 90], [60, 50, 10], Math.max(1, s / 18));
  } else if (kind === PowerUpKind.Range) {
    const flame: [number, number][] = [
      [0, -0.5], [0.18, -0.2], [0.32, 0.05], [0.28, 0.3], [0.12, 0.45],
      [-0.12, 0.45], [-0.28, 0.3], [-0.32, 0.05], [-0.15, -0.1],
    ];
    polygon(ctx, scaled(flame), [230, 50, 20]);
    polygon(ctx, scaled(flame, 0.55, 0.18), [255, 220, 70]);
  } else {
    const r = s * 0.3;
    const bx = cx - s * 0.05;
    const by = cy + s * 0.08;
    fillCircle(ctx, bx, by, r, [25, 25, 30]);
    fillCircle(ctx, bx - r * 0.35, by - r * 0.35, Math.max(1, r * 0.25), [130, 130, 150]);
    line(ctx, bx + r * 0.5, by - r * 0.8, cx + s * 0.3, cy - s * 0.42, [200, 170, 120], Math.max(1, s / 18));
    fillCircle(ctx, cx + s * 0.32, cy - s * 0.44, Math.max(2, s * 0.08), [255, 200, 60]);
  }
}
