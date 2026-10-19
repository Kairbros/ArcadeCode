// Reglas de minado de la supervivencia: cuánto tarda cada bloque según lo que lleves en la mano y qué
// suelta al romperse. Sin herramienta se tarda más; con la herramienta equivocada, aún más.
import { BLOCKS } from "./blocks";
import { itemInfo, type Tool } from "./items";

/** Multiplicador de tiempo cuando el bloque pide herramienta y no la llevas (o no es la suya). */
const SLOW = 2.5;

function toolOf(held: number | null | undefined): Tool | undefined {
  return held != null ? itemInfo(held)?.tool : undefined;
}

/** Segundos que se tarda en romper un bloque con el objeto en la mano (Infinity si no se puede). */
export function breakSeconds(block: number, held: number | null | undefined): number {
  const info = BLOCKS[block];
  if (!info || info.unbreakable) return Infinity;
  const tool = toolOf(held);
  const right = !!info.tool && tool?.kind === info.tool;
  const speed = right ? tool!.speed : 1;
  const slow = info.tool && !right ? SLOW : 1;
  return Math.max(0.08, (info.hardness * slow) / speed);
}

/** Lo que suelta el bloque con ese objeto en la mano (null = nada). */
export function dropOf(block: number, held: number | null | undefined): { id: number; n: number } | null {
  const info = BLOCKS[block];
  if (!info || info.unbreakable) return null;
  const tool = toolOf(held);
  if (info.req !== undefined && (!tool || tool.kind !== info.tool || tool.tier < info.req)) return null;
  return { id: info.drop ?? block, n: info.dropN ?? 1 };
}
