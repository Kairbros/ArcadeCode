# Memoria del proyecto: Arcade (Bomberman + Karts)

Guía para quien vaya a extender el proyecto (persona o agente). Resume decisiones, contratos, despliegue
y trampas conocidas. El README cubre el uso; este documento, el porqué y el cómo extender.

## 1. Qué es y restricciones que guían todo

- Hub de juegos multijugador en TypeScript + Canvas 2D. Se juega en el navegador o dentro de VS Code
  (vista "Arcade" en el Explorador). Juegos: **Bomberman** y **Karts** (modo 7).
- **Pantalla muy pequeña**: se juega sobre todo en la barra lateral de VS Code (~180–300 px de ancho).
  Todo el UI (menú, HUD) debe funcionar ahí. El lienzo escala el tamaño lógico del juego.
- **Red corporativa**: los equipos de la oficina pueden no verse entre sí. Por eso la conexión es
  WebRTC directa con **respaldo automático por relé HTTP en Vercel**.
- **Hasta 4 jugadores**. Accesibilidad: **escala de grises** (botón del menú o tecla G); en gris los
  jugadores se distinguen por su número.
- Idioma: interfaz, comentarios y mensajes en **español**. Sin nombres ni personajes de Nintendo.
- Existe una versión Python/pygame antigua en `../bomberman/` (solo Bomberman, sin red). No se usa.

## 2. Comandos

```
npm install
npm run typecheck         # tsc --noEmit (strict, noUnusedLocals)
npm run serve -- 8000     # servidor local: juego + /api/signal en memoria, accesible en la LAN
npm run build             # extensión (dist/extension.cjs) + juego para webview (dist/game.js)
npm run build:web         # juego para Vercel (web/dist/main.js)
npx @vscode/vsce package --allow-missing-repository --skip-license --out bomberman.vsix
code --install-extension bomberman.vsix --force    # luego "Developer: Reload Window"
npx vercel --prod         # desplegar
```

## 3. Despliegue actual

- Vercel: **https://bomber-five-tawny.vercel.app** (es el valor por defecto de `bomberman.serverUrl`).
- Redis: Upstash vía Marketplace de Vercel, región **us-west-1**. La función está fijada a **sfo1**
  en `vercel.json` para estar junto a Redis (si se cambia la región de Redis, cambiar `regions`).
- Variables que lee la API: `KV_REST_API_URL`/`KV_REST_API_TOKEN` (o `UPSTASH_REDIS_REST_*`).
  Sin ellas usa memoria (solo válido en local).
- **Cuándo redesplegar**: si cambia `api/` o `src/server/` (siempre), o si alguien juega desde la web
  (la página sirve el cliente). La extensión lleva su propio cliente: no necesita redesplegar por
  cambios solo de juego.
- Cuota gratuita de Upstash: 500.000 comandos/mes. Solo gastan los jugadores que van por relé.

## 4. Arquitectura

```
api/signal.ts              función de Vercel (POST/OPTIONS/GET) → src/server/signal.ts
src/server/signal.ts       emparejamiento + relé; RedisLike (MemoryRedis | UpstashRedis REST multi-exec)
scripts/serve.mjs          servidor local: esbuild serve + proxy + misma API en memoria
src/extension.ts           extensión: WebviewView en el Explorador + panel grande; CSP con nonce;
                           inyecta window.BOMBERMAN_CONFIG = { serverUrl, grayscale }
src/game/main.ts           entrada: menú, partidas locales/anfitrión/invitado, escalado del lienzo
src/game/hub.ts            registro de juegos: GAMES, createHostGame, createGuestGame
src/game/core/             compartido: config común, rng (mulberry32), keyboard, settings, draw
src/game/ui/menu.ts        menú HTML (responsive, CSS en línea)
src/game/net/              red genérica: host, guest, rtc, relay (parámetros), signaling, types, protocol
src/game/bomberman/        ECS (components, ecs, systems/), mapgen, prefabs, game, input, render/,
                           snapshot (base+deltas), net (adaptadores HostGame/GuestGame)
src/game/karts/            config, track (generador), physics, race (árbitro+IA), input, render (modo 7),
                           kart-sprite (sprites 3D prerenderizados), game (adaptadores)
```

### Contrato de red (lo que un juego debe implementar) — `src/game/net/types.ts`

- `HostGame`: `size`, `netLabel`, `update(dt)`, `draw(ctx, scale)`, `key(code)`,
  `frame(now) → { snap, base }`, `onMessage(index, msg)`, `onDisconnect(index)`.
- `GuestGame`: `id`, `size`, `baseSeq`, `ready`, `netLabel`, `onBase(b)`, `onSnap(s)`, `update(dt)`,
  `draw`, `outgoing(transport) → objeto | undefined` (el juego decide el ritmo de envío).
- `snap` **siempre** lleva `g` (id del juego), `seq` (creciente) y `base` (secuencia de la base,
  `-1` si el juego no usa bases). El invitado crea el juego al ver `snap.g`.
- Índices de jugador: 0 = anfitrión, 1..3 invitados (asignados al pulsar "Empezar").

### Cómo añadir un juego nuevo

1. Carpeta `src/game/<juego>/` con su lógica, render e input (los controles se crean desde `Keyboard`).
2. Implementar `HostGame` (vale también para local con 0 remotos) y `GuestGame`.
3. Registrar en `hub.ts`: `GameId`, entrada en `GAMES`, ramas en `createHostGame`/`createGuestGame`.
4. Local: añadir la rama en `startLocal` de `main.ts`.
5. Mensajes invitado→anfitrión: **≤ 300 caracteres en JSON** (límite `MAX_INPUT` del relé) e incluir
   un número de secuencia `s` (por el relé llegan desordenados; el anfitrión descarta los viejos).
6. Teclas que deban anular el scroll: añadir a `captured` en `main.ts`.
7. Probar en la barra lateral (tamaño pequeño) y en escala de grises.

### Red y relé

- Invitado: oferta WebRTC sin trickle (espera ICE ≤ 2 s); si en `P2P_TIMEOUT_MS` (7 s) no abre el
  canal, pide relé (`action: "relay"`) y sigue por HTTP. `join` con `offer: null` = sin WebRTC.
- Relé (`src/game/net/relay.ts`): `RELAY_HZ` = 10, hasta `RELAY_MAX_IN_FLIGHT` = 3 peticiones en
  paralelo, keepalive 1 s, desconexión a los 10 s sin noticias.
- API `/api/signal` (POST JSON `{action,...}`): invitado `join | poll | relay | guest-sync`;
  anfitrión (requiere `hostKey` de `create`) `offers | answer | close | host-sync`.
- Claves Redis: `room:C` (abierta), `room:C:host`, `:offers`, `:relays`, `:answer:GID`, `:snap`,
  `:base`, `:in`, `:w:GID`. Coste habitual: host-sync 2 comandos, guest-sync 1 (+2 si envía entrada).
- `hostKey` se valida en memoria de la instancia (caché 30 s) para ahorrar comandos.

## 5. Bomberman (claves)

- ECS propio (`ecs.ts`): `query(...tipos)` tipado, bajas diferidas (`destroy` + `flush` tras cada sistema),
  `spawn(id)` para reconstruir desde red. Orden de sistemas en `game.ts` (intención → acción → consecuencias).
- Mapas procedurales por semilla con simetría, conectividad garantizada y botín equilibrado (3 buffs).
- Red: base completa + deltas (`snapshot.ts`, rebase si hay > 40 cambios o cada 5 s); el invitado
  interpola posiciones. Muros no viajan: se regeneran desde la semilla.

## 6. Karts (claves)

- Modo 7 por software: 256×224 (`KW`×`KH`), suelo muestreado por filas desde una textura TEX×TEX
  (1536), niebla, cielo con 2 capas de montañas. Sprites proyectados y ordenados por profundidad.
- Circuitos (`track.ts`): 70 % "cuadrícula" (contorno de un poliominó en 7×7 casillas de 170) y 30 %
  "orgánico" (envolvente con hendiduras/lenguas/eses), suavizado Chaikin ×4, validación
  (radio ≥ 42, separación entre tramos ≥ `TRACK_W+WALL_MARGIN+16`, longitud 2.400–5.600),
  hasta 120 intentos y óvalo de emergencia. Meta en la recta más larga. Decoración sólida por tema.
- Física (`physics.ts`): `a` = morro, `ma` = dirección de avance (se separan al derrapar),
  muro invisible a `TRACK_W/2 + WALL_MARGIN`, progreso en puntos de línea central (vueltas = progreso/n).
- Derrape: Shift/C (saltito → derrape si se gira); miniturbo al soltar (azul > 0,8 s, naranja > 1,7 s).
- Objetos: turbo, plátano, proyectil; los de atrás reciben más turbos. 3 vueltas, 4 corredores (IA rellena).
- Red: **cada invitado simula su propio kart** (sin retraso) y envía posición; el anfitrión
  (`race.ts`) arbitra cajas, golpes (`spinSeq`), objetos y llegada. Turbo se aplica al instante en el invitado.
- IA: sigue la línea central con desvío propio y frena según el giro de los próximos ~150 u (`cornerSpeed`).
- Sprites de kart (`kart-sprite.ts`): ~20 cajas 3D + casco, 32 vistas por color, cacheadas, escaladas sin suavizado.

## 7. Trampas conocidas (ya nos pasaron)

- **PowerShell 5.1 + tildes**: `Get-Content`/`Set-Content` sin codificación rompen UTF-8 (`pestaÃ±a`).
  Editar con el editor o con Node (`fs` en utf8); nunca reescribir fuentes con cmdlets de PowerShell.
- **`onkeydown = () => cond && f()`** devuelve `false` y cancela la tecla: usar `addEventListener` sin devolver nada.
- **Vercel + ESM**: `package.json` tiene `"type": "module"`; las importaciones relativas en `api/` llevan
  `.js` (`../src/server/signal.js`). La extensión se compila a `dist/extension.cjs` por eso.
- **Vercel no mantiene WebSockets**: el relé es HTTP con Redis; no intentar sockets en funciones.
- `npx tsc` debe ejecutarse desde `bomberman-ts/` (fuera, npx instala un paquete `tsc` equivocado).
- Teclado en `Keyboard` ignora eventos cuando se escribe en inputs (`isTyping`).

## 8. Cómo se ha probado (reutilizable)

- Lógica en Node: empaquetar con esbuild (`--platform=node`) y simular (carreras solo IA, 400
  circuitos, mapas de Bomberman, física de derrape).
- Render y red en Edge sin ventana controlado por CDP (`--remote-debugging-port`): capturas, tecleo,
  y prueba de extremo a extremo con anfitrión + invitado directo + invitado "bloqueado" (se quitan las
  líneas `a=candidate` del SDP para forzar el relé) contra `npm run serve`.
- Antes de entregar: `npm run typecheck`, `npm run build`, `npm run build:web` y reempaquetar el `.vsix`.
