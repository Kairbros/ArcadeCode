// Ventajas de las máquinas (como las de Black Ops 2 Zombies): Juggernog, Speed Cola, Double Tap y Quick Revive.
// Datos y reglas puras (sin Three.js): precio, color, qué cambia en el jugador y dónde está cada máquina. Cada jugador
// lleva las suyas en una máscara de bits (`perks`); se pierden al caer abatido.
import { PLAYER } from "../player/player";

export type PerkId = "juggernog" | "speedCola" | "doubleTap" | "quickRevive";

export interface PerkDef {
  id: PerkId;
  name: string;
  cost: number;
  /** Color del cartel y la luz (0xRRGGBB) y bit en la máscara. */
  color: number;
  bit: number;
  /** Necesita la energía del sector (como en BO2: salvo Quick Revive). */
  needsPower: boolean;
  /** Descripción corta del efecto, para el HUD. */
  desc: string;
  /** Letra del icono del HUD. */
  icon: string;
}

export const PERKS: Record<PerkId, PerkDef> = {
  juggernog: { id: "juggernog", name: "JUGGERNOG", cost: 2500, color: 0xff4a3a, bit: 1, needsPower: true, desc: "VIDA ×2,5", icon: "J" },
  speedCola: { id: "speedCola", name: "SPEED COLA", cost: 3000, color: 0x4aff7a, bit: 2, needsPower: true, desc: "RECARGA ×2", icon: "S" },
  doubleTap: { id: "doubleTap", name: "DOUBLE TAP", cost: 2000, color: 0xffc83a, bit: 4, needsPower: true, desc: "MÁS CADENCIA Y DAÑO", icon: "D" },
  quickRevive: { id: "quickRevive", name: "QUICK REVIVE", cost: 1500, color: 0x4ab8ff, bit: 8, needsPower: false, desc: "REVIVES RÁPIDO", icon: "Q" },
};

export const PERK_IDS = Object.keys(PERKS) as PerkId[];

export const PERK_TUNING = {
  /** Vida con Juggernog. */
  juggHealth: 250,
  /** Multiplicadores de Speed Cola (tiempo de recarga) y Double Tap (cadencia y daño). */
  reloadScale: 0.5,
  rateScale: 1.33,
  damageScale: 1.5,
  /** Segundos que se mantiene E para revivir (con Quick Revive el que revive o el que se levanta solo tarda la mitad). */
  reviveTime: 4,
  reviveTimeQuick: 2,
  /** Segundos que aguanta abatido antes de desangrarse, y espera de la autorresurrección de Quick Revive en solitario. */
  bleedOut: 30,
  soloRevive: 4,
  /** Distancia a la que se puede revivir (m). */
  reviveReach: 1.8,
  /** La vida se regenera pasados estos segundos sin recibir daño (puntos de vida por segundo). */
  regenDelay: 4,
  regenRate: 36,
} as const;

/** Dónde está cada máquina (junto a un muro existente) y hacia dónde mira su frente (rotación sobre Y). */
export const PERK_SPOTS: Record<PerkId, { x: number; z: number; rot: number }> = {
  quickRevive: { x: -4.45, z: -6.1, rot: Math.PI / 2 },
  juggernog: { x: 8.4, z: 0.45, rot: Math.PI },
  speedCola: { x: 18.3, z: -23.4, rot: 0 },
  doubleTap: { x: -22.4, z: -21.0, rot: Math.PI / 2 },
};

export const hasPerk = (mask: number, id: PerkId): boolean => (mask & PERKS[id].bit) !== 0;

export const addPerk = (mask: number, id: PerkId): number => mask | PERKS[id].bit;

/** Vida máxima según las ventajas. */
export const maxHealthFor = (mask: number): number => (hasPerk(mask, "juggernog") ? PERK_TUNING.juggHealth : PLAYER.maxHealth);

/** Segundos de mantener E para revivir a un compañero. */
export const reviveTimeFor = (reviverMask: number): number => (hasPerk(reviverMask, "quickRevive") ? PERK_TUNING.reviveTimeQuick : PERK_TUNING.reviveTime);

/** Ventajas que lleva una máscara (para el HUD). */
export const perksIn = (mask: number): PerkDef[] => PERK_IDS.filter((id) => hasPerk(mask, id)).map((id) => PERKS[id]);
