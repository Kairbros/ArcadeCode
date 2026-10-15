// Parámetros del relé HTTP por Vercel (respaldo cuando no hay conexión directa).

/** Sincronizaciones por segundo de cada participante (1 petición HTTP cada una). */
export const RELAY_HZ = 10;
/** Peticiones simultáneas: así la frecuencia no depende de la latencia hasta Vercel. */
export const RELAY_MAX_IN_FLIGHT = 3;
/** Cada cuánto el invitado reenvía su entrada aunque no cambie (mantiene viva la conexión). */
export const RELAY_KEEPALIVE_MS = 1000;
/** Sin noticias durante este tiempo, se da al otro lado por desconectado. */
export const RELAY_STALE_MS = 10_000;
/** Tiempo que el invitado espera a la conexión directa antes de pasarse al relé. */
export const P2P_TIMEOUT_MS = 7000;
