// Sucesos del casino que se avisan a los jugadores (cárcel, depósitos, borrachos, mecanismos, fin de ronda).
// El anfitrión los guarda unos segundos en el estado (`ne`: `[número, tipo, jugador, valor]`) y cada pantalla
// saca el texto que le toca con `eventText`; así el anfitrión y los invitados avisan exactamente igual.
import { FAIL_TEXT, type DepositFail } from "./ventanilla";

export const EVT_JAIL_GUARD = 1; // valor: monedas perdidas
export const EVT_JAIL_CROUPIER = 2;
export const EVT_JAIL_ROB = 3;
export const EVT_DEPOSIT = 4; // valor: monedas depositadas
export const EVT_DEPOSIT_FAIL = 5; // valor: índice en FAILS
export const EVT_DRUNK_SAT = 6; // global; valor: mesa
export const EVT_DRUNK_LOSS = 7; // valor: monedas perdidas
export const EVT_PUSH_OK = 8; // quien aparta; valor: segundos de sueño
export const EVT_PUSH_FAIL = 9;
export const EVT_LEVER = 10; // valor: segundos de reja abierta
export const EVT_LURE = 11; // valor: guardias que acuden
export const EVT_ALARM = 12; // global; valor: botones de la secuencia
export const EVT_ALARM_OFF = 13; // quien la apagó
export const EVT_ALARM_END = 14; // global: se acabó sola
export const EVT_SEQ_OK = 15; // valor: botones acertados
export const EVT_SEQ_WRONG = 16;
export const EVT_ROUND_WIN = 17; // global; valor: ronda superada
export const EVT_ROUND_LOSE = 18;
export const EVT_PAYOUT = 19; // valor: lo que vuelve a tu cartera del depósito
export const EVT_BOSS = 20;
export const EVT_ROUND_START = 21; // global; valor: número de ronda

/** Motivos de rechazo en el orden en que viajan. */
export const FAILS: DepositFail[] = ["duplicada", "cerrada", "bloqueada", "importe", "saldo", "limite", "tope", "vigilada", "preso"];

export type GameEvent = number[];

/**
 * Texto del suceso `e = [número, tipo, jugador, valor]` visto por el jugador `me`; `null` si no le afecta.
 * Los que empiezan por «¡» salen en rojo en el HUD (malas noticias).
 */
export function eventText(e: GameEvent, me: number): string | null {
  const [, kind, who, v] = e;
  const mine = who === me;
  switch (kind) {
    case EVT_JAIL_GUARD:
    case EVT_JAIL_CROUPIER:
    case EVT_JAIL_ROB: {
      const by = kind === EVT_JAIL_GUARD ? "EL GUARDIA" : kind === EVT_JAIL_CROUPIER ? "EL CRUPIER" : "LA CASA";
      if (mine) return v > 0 ? `¡${by} TE ATRAPÓ! CÁRCEL: −${v} MONEDAS (50 %)` : `¡${by} TE ATRAPÓ! A LA CÁRCEL`;
      return who >= 0 ? `¡J${who + 1} CAYÓ PRESO!` : null;
    }
    case EVT_DEPOSIT:
      return mine ? `+${v} EN LA VENTANILLA · YA PUEDES APOSTAR` : `J${who + 1} DEPOSITÓ ${v}`;
    case EVT_DEPOSIT_FAIL:
      return mine ? `¡NO SE PUDO DEPOSITAR! ${failText(v)}` : null;
    case EVT_DRUNK_SAT:
      return "¡UN BORRACHO BLOQUEA UNA MESA! APÁRTALO CON E";
    case EVT_DRUNK_LOSS:
      return mine ? `¡EL BORRACHO TE HIZO PERDER ${v} MONEDAS DE TU APUESTA!` : null;
    case EVT_PUSH_OK:
      return mine ? `¡APARTADO! EL BORRACHO DUERME ${v} s` : "EL BORRACHO CAYÓ DORMIDO";
    case EVT_PUSH_FAIL:
      return mine ? "¡SE RESISTE! INTÉNTALO DE NUEVO" : null;
    case EVT_LEVER:
      return mine ? `REJA ABIERTA ${v} s · A LA VENTANILLA` : "LA REJA DE LA VENTANILLA SE ABRE";
    case EVT_LURE:
      return mine ? `TIMBRE: ${v} GUARDIA${v === 1 ? "" : "S"} ACUDEN · ¡AHORA!` : "¡SUENA EL TIMBRE! LOS GUARDIAS ACUDEN";
    case EVT_ALARM:
      return `¡ALARMA! VENTANILLA BLOQUEADA · TECLEA LA SECUENCIA (${v} BOTONES)`;
    case EVT_ALARM_OFF:
      return mine ? "ALARMA APAGADA · VENTANILLA LIBRE" : "ALARMA APAGADA";
    case EVT_ALARM_END:
      return "LA ALARMA SE ACABÓ SOLA";
    case EVT_SEQ_OK:
      return mine ? `BOTÓN CORRECTO (${v})` : null;
    case EVT_SEQ_WRONG:
      return mine ? "¡BOTÓN EQUIVOCADO! LA SECUENCIA SE REINICIA" : null;
    case EVT_ROUND_WIN:
      return `¡RONDA ${v} SUPERADA!`;
    case EVT_ROUND_LOSE:
      return "¡LA CASA COBRA! TODOS A LA CÁRCEL";
    case EVT_PAYOUT:
      return mine && v > 0 ? `FIN DE RONDA · TU DEPÓSITO (${v}) VUELVE A LA CARTERA` : null;
    case EVT_BOSS:
      return "¡PREPARADOS! EL JEFE FINAL VENDRÁ EN LA SIGUIENTE FASE";
    case EVT_ROUND_START:
      return `RONDA ${v}`;
    default:
      return null;
  }
}

const failText = (i: number) => FAIL_TEXT[FAILS[i] ?? "importe"];
