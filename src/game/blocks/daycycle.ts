// Ciclo de día y noche. El reloj lo lleva el anfitrión y viaja en cada estado; con él se calcula lo que hace
// falta: cuánta luz da el cielo (se aplica en el shader del mundo, sin rehacer mallas), dónde están el sol y la
// luna y si los monstruos pueden aparecer al aire libre. Sin DOM ni WebGL (se usa en Node).

/** Segundos de un día entero (día, atardecer, noche y amanecer). */
export const DAY_LENGTH = 600;
/** El reloj empieza por la mañana temprano. */
export const MORNING = DAY_LENGTH * 0.06;
/** Brillo de la luz del cielo de noche (la luna), sobre 1 a pleno día. */
export const NIGHT_SKY = 0.2;

/** Altura del sol: 1 a mediodía, 0 al salir y al ponerse, -1 a medianoche. */
export function sunHeight(clock: number): number {
  return Math.sin((clock / DAY_LENGTH) * Math.PI * 2);
}

/** Luz del día: 0 de noche cerrada, 1 a pleno día (el paso dura lo que tarda el sol en cruzar el horizonte). */
export function daylight(clock: number): number {
  const k = Math.max(0, Math.min(1, (sunHeight(clock) + 0.15) / 0.45));
  return k * k * (3 - 2 * k);
}

/** Factor por el que se multiplica la luz del cielo al dibujar (de NIGHT_SKY a 1). */
export function skyFactor(clock: number): number {
  return NIGHT_SKY + (1 - NIGHT_SKY) * daylight(clock);
}

/** Nivel de la luz del cielo (0–15) que cuenta ahora: de noche, el cielo pleno vale 4 (como en Minecraft). */
export function skyLevel(sky: number, day: number): number {
  return Math.round((sky * (4 + 11 * day)) / 15);
}
