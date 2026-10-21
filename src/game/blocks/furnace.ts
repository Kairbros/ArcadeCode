// Horno (supervivencia): funde minerales, cocina la carne y hace cristal, piedra y carbón vegetal. Cada horno
// guarda tres ranuras (lo que se funde, el combustible y el resultado) y sigue funcionando con la pantalla
// cerrada. Como el inventario, es de cada jugador: lo que alguien mete en un horno solo lo ve él (en red no
// viaja nada, solo el bloque). Sin DOM ni WebGL (se usa en Node).
import { COAL, COBBLE, GLASS, IRON_ORE, LOG, PLANKS, SAND, STONE, TABLE } from "./blocks";
import type { Slot } from "./inventory";
import {
  BEEF, CHARCOAL, CHICKEN_MEAT, COOKED_BEEF, COOKED_CHICKEN, COOKED_MUTTON, COOKED_PORK, IRON_INGOT, MUTTON, PORK,
  STICK, WOOD_AXE, WOOD_PICK, WOOD_SHOVEL, WOOD_SWORD, itemInfo,
} from "./items";

/** Segundos por objeto fundido o cocinado. */
export const SMELT_TIME = 5;

/** Lo que sale de cada cosa al fundirla o cocinarla. */
export const SMELT: Record<number, number> = {
  [IRON_ORE]: IRON_INGOT,
  [SAND]: GLASS,
  [COBBLE]: STONE,
  [LOG]: CHARCOAL,
  [BEEF]: COOKED_BEEF,
  [PORK]: COOKED_PORK,
  [MUTTON]: COOKED_MUTTON,
  [CHICKEN_MEAT]: COOKED_CHICKEN,
};

/** Segundos que arde cada combustible (el carbón funde 8 cosas; un tablón, 1,5). */
export const FUEL: Record<number, number> = {
  [COAL]: 40, [CHARCOAL]: 40, [LOG]: 7.5, [PLANKS]: 7.5, [TABLE]: 7.5, [STICK]: 2.5,
  [WOOD_PICK]: 5, [WOOD_AXE]: 5, [WOOD_SHOVEL]: 5, [WOOD_SWORD]: 5,
};

export const IN = 0, FUEL_SLOT = 1, OUT = 2;

export class Furnace {
  /** Lo que se funde, el combustible y el resultado. */
  slots: Slot[] = [null, null, null];
  /** Segundos de fuego que quedan y los que daba el último combustible (para dibujar la llama). */
  burn = 0;
  burnMax = 0;
  /** Segundos fundiendo lo que hay ahora. */
  progress = 0;

  /** ¿Lo de la entrada se puede fundir y cabe en la salida? */
  private get ready(): boolean {
    const s = this.slots[IN], out = s ? SMELT[s.id] : 0, o = this.slots[OUT];
    return !!out && (!o || (o.id === out && o.n < itemInfo(out).max));
  }

  update(dt: number) {
    // Se enciende otro combustible solo si hay algo que fundir.
    const fuel = this.slots[FUEL_SLOT];
    if (this.burn <= 0 && this.ready && fuel && FUEL[fuel.id]) {
      this.burn = this.burnMax = FUEL[fuel.id];
      fuel.n--;
      if (fuel.n <= 0) this.slots[FUEL_SLOT] = null;
    }
    if (this.burn > 0) {
      this.burn = Math.max(0, this.burn - dt);
      if (!this.ready) {
        this.progress = 0;
        return;
      }
      this.progress += dt;
      if (this.progress >= SMELT_TIME) {
        this.progress = 0;
        const s = this.slots[IN]!, out = SMELT[s.id], o = this.slots[OUT];
        s.n--;
        if (s.n <= 0) this.slots[IN] = null;
        if (o) o.n++;
        else this.slots[OUT] = { id: out, n: 1 };
      }
    } else {
      // Sin fuego, lo que iba fundiendo se enfría.
      this.progress = Math.max(0, this.progress - dt * 2);
    }
  }

  get burning(): boolean {
    return this.burn > 0;
  }
}
