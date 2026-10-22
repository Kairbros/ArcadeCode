# Memoria del proyecto: Arcade (Bomberman, Karts, Sumo de bolas, Monigotes, Ruleta de cartuchos, Bloques, Casino de deudas y Billar)

Guía para quien vaya a extender el proyecto (persona o agente). Resume decisiones, contratos, despliegue
y trampas conocidas. El README cubre el uso; este documento, el porqué y el cómo extender.

## 1. Qué es y restricciones que guían todo

- Hub de juegos multijugador en TypeScript + Canvas 2D. Se juega en el navegador o dentro de VS Code
  (vista "Arcade" en el Explorador). Juegos: **Bomberman**, **Karts** (3D con relieve),
  **Sumo de bolas** (3D), **Monigotes** (peleas en plataformas) y **Ruleta de cartuchos**
  (escopeta por turnos contra un crupier, en 3D; inspirado en un juego indie, con nombre propio) y
  **Bloques** (mundo de bloques en primera persona tipo Minecraft, con nombre propio; creativo y supervivencia) y
  **Casino de deudas** (casino cooperativo con banco común y cuota diaria; inspirado en un juego indie, con nombre propio).
- **Pantalla muy pequeña**: se juega sobre todo en la barra lateral de VS Code (~180–300 px de ancho).
  Todo el UI (menú, HUD) debe funcionar ahí. El lienzo escala el tamaño lógico del juego.
- **Red corporativa**: los equipos de la oficina pueden no verse entre sí. Por eso la conexión es
  WebRTC directa con **respaldo automático por relé HTTP en Vercel**.
- **Hasta 4 jugadores**. Accesibilidad: **escala de grises** (botón del menú o tecla G); en gris los
  jugadores se distinguen por su número.
- Idioma: interfaz, comentarios y mensajes en **español**. Sin nombres ni personajes de Nintendo.
- **3D en bloques simples**: los modelos 3D se hacen con cajas grandes, sin esferas ni vóxeles finos (ver 6e).
- **Interfaz de recreativa**: todo el texto con la fuente de píxeles propia, paneles y rótulos retro (ver 6f).
- Existe una versión Python/pygame antigua en `../bomberman/` (solo Bomberman, sin red). No se usa.

## 2. Comandos

Todo desde la raíz del proyecto. En un clon limpio no hay `node_modules/` ni `dist/` (están en `.gitignore`):
hay que hacer `npm install` antes de nada.

```
npm install
npm run typecheck         # tsc --noEmit (strict, noUnusedLocals)
npm run serve -- 8000     # servidor local: juego + /api/signal en memoria, accesible en la LAN
npm run build             # extensión (dist/extension.cjs) + juego para webview (dist/game.js)
npm run build:web         # juego para Vercel (web/dist/main.js)
npx @vscode/vsce package --allow-missing-repository --skip-license --baseContentUrl https://github.com/Kairbros/ArcadeCode/blob/main --baseImagesUrl https://github.com/Kairbros/ArcadeCode/raw/main --out arcade.vsix
# (sin --baseContentUrl vsce falla: el README enlaza a MEMORIA.md con ruta relativa)
code --install-extension arcade.vsix --force    # luego "Developer: Reload Window"
npx vercel --prod         # desplegar
```

## 3. Despliegue actual

- Vercel: **https://bomber-five-tawny.vercel.app** (es el valor por defecto de `arcade.serverUrl`).
- Marketplace: ID **`kairbros-dev.kairbros-arcade`**, nombre visible **"Kairbros Arcade"** ("Arcade" a secas ya
  existía en la Marketplace, que exige nombres visibles únicos). Antes era `bomberman-procedural`; se renombró el 2026-10-17 para quitar
  "bomberman" del paquete: vista `arcade.view`, comando `arcade.play`, ajustes `arcade.*`,
  `window.ARCADE_CONFIG`). Las claves de localStorage de la web siguen siendo `bomberman.*` a propósito,
  para no perder el nombre guardado. Subir siempre el `.vsix` del proyecto (uno viejo en Descargas
  llevaba publisher `local` y la Marketplace lo rechazó).
- Redis: Upstash vía Marketplace de Vercel, región **us-west-1**. La función está fijada a **sfo1**
  en `vercel.json` para estar junto a Redis (si se cambia la región de Redis, cambiar `regions`).
- Variables que lee la API (`redisFromEnv`): `UPSTASH_REDIS_REST_URL`/`_TOKEN` y, si no están,
  `KV_REST_API_URL`/`KV_REST_API_TOKEN` (las que añade la integración de Vercel).
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
src/extension.ts           extensión: WebviewView en el Explorador + panel grande (comando arcade.play);
                           CSP con nonce; inyecta window.ARCADE_CONFIG = { serverUrl, grayscale,
                           playerName, bots }. El juego guarda ajustes con postMessage (setGrayscale,
                           setBots, setPlayerName); la extensión reenvía la escala de grises en caliente
                           y recarga la vista si cambia serverUrl
src/game/main.ts           entrada: menú, partidas locales/anfitrión/invitado, escalado del lienzo
src/game/hub.ts            registro de juegos: GAMES, createHostGame, createGuestGame
src/game/core/             compartido: config común, rng (mulberry32), keyboard, names, draw (+ adornos retro),
                           pixelfont (fuente de píxeles), crt (efecto de tubo) y settings
                           (ajustes de VS Code dentro de la extensión; localStorage en la web)
src/game/ui/menu.ts        menú HTML (responsive, CSS en línea)
src/game/net/              red genérica: host, guest, rtc, relay (parámetros), signaling, types, protocol
src/game/bomberman/        ECS (components, ecs, systems/), mapgen, prefabs, game, input, render/,
                           snapshot (base+deltas), net (adaptadores HostGame/GuestGame)
src/game/karts/            config, track (generador), terrain (relieve), physics, race (árbitro+IA), input,
                           render (Three.js, bloques), game (adaptadores)
src/game/balls/            config, arena (física+IA+árbitro), input, render (Three.js, bloques), game (adaptadores)
src/game/core/three.ts     3D compartido: un solo WebGLRenderer (`glRenderer`), `renderInto`, `projectTo`, `glowSprite`,
                           `blockGeometry` (muchas cajas de colores en una malla), `disposeScene`
src/game/stick/            config, stages, fight (física+armas+bots+árbitro), input, render (poses por código), game
src/game/ruleta/           config, match (reglas+árbitro), bot, state (estado de red), input (teclas+selector),
                           math3d (vectores/giros), textures (generadas), models (Three.js), render (escena+HUD), game
src/game/pool/             config, table (física + trace), match (reglas), bot, input (ratón+teclado), render (3D ortogonal + HUD), game
src/game/blocks/           config, blocks (tipos), world (generación con cuevas y menas+luz+rayo+diff), mesher (chunks), player (física),
                           pilot (jugador propio), atlas (texturas), input (teclado+ratón), render (Three.js+HUD), game;
                           supervivencia: items, inventory, crafting (recetas), craftui (pantalla con ratón), icons,
                           drops (objetos en el suelo, solo en el anfitrión), mobs (animales, solo en el anfitrión),
                           vitals (vida, hambre y aire de cada jugador, local),
                           furnace (hornos de cada jugador, local), daycycle (reloj del día)
```

### Contrato de red (lo que un juego debe implementar) — `src/game/net/types.ts`

- `HostGame`: `size`, `netLabel`, `finished` (ronda terminada: permite cambiar de juego), `update(dt)`, `draw(ctx, scale)`, `key(code)`,
  `frame(now) → { snap, base }`, `onMessage(index, msg)`, `onDisconnect(index)`.
- `GuestGame`: `id`, `size`, `baseSeq`, `ready`, `netLabel`, `onBase(b)`, `onSnap(s)`, `update(dt)`,
  `draw`, `outgoing(transport) → objeto | undefined` (el juego decide el ritmo de envío).
- `snap` **siempre** lleva `g` (id del juego), `seq` (creciente) y `base` (secuencia de la base,
  `-1` si el juego no usa bases). El invitado crea el juego al ver `snap.g`.
- Índices de jugador: 0 = anfitrión, 1..3 invitados (asignados al pulsar "Empezar").
- **Bots** (`settings.bots`, ajuste `arcade.bots`, botón del menú): con bots la IA rellena hasta 4 en Karts y
  Sumo; sin ellos solo juegan las personas (solo = contrarreloj / aguantar 60 s). En red vale el del anfitrión
  (`createHostGame`). Los enemigos de Bomberman no son bots: no les afecta. Afecta a Karts, Sumo y Monigotes;
  en Ruleta de cartuchos sienta al crupier (un solo bot), que en solitario se sienta siempre. Bloques y Casino no tienen bots.
- **Nombres** (`core/names.ts`): `PLAYER_NAMES` es mutable y los juegos lo leen al dibujar. El nombre se elige en el
  menú (ajuste `arcade.playerName` o localStorage, máx. 12). El invitado lo manda en `{t:"hello"}` (directo) y
  como campo `nm` en sus mensajes hasta verlo en `snap.n`, la lista que `HostSession.stamp` añade a cada estado.
  Por relé el nombre no se ve en la sala de espera, solo al empezar.
- **Cambio de juego sin cerrar la sala**: al terminar (`finished`), el anfitrión pulsa J y elige otro juego
  (`HostSession.switchGame`). El invitado lo crea al ver otro `snap.g`. Como cada juego numera `seq` y bases
  desde 1, `HostSession` les suma un desfase para que sigan creciendo; el invitado guarda la última base
  (puede llegar justo antes del cambio).

### Cómo añadir un juego nuevo

1. Carpeta `src/game/<juego>/` con su lógica, render e input (los controles se crean desde `Keyboard`).
2. Implementar `HostGame` (vale también para local con 0 remotos) y `GuestGame`.
3. Registrar en `hub.ts`: `GameId`, entrada en `GAMES`, ramas en `createHostGame`/`createGuestGame`.
4. Local: añadir la rama en `startLocal` de `main.ts`.
5. Mensajes invitado→anfitrión: **≤ 300 caracteres en JSON** (límite `MAX_INPUT` del relé) e incluir
   un número de secuencia `s` (por el relé llegan desordenados; el anfitrión descarta los viejos).
6. Teclas que deban anular el scroll: añadir a `captured` en `main.ts`.
7. Implementar `finished` y mencionar "J: cambiar juego" en la pantalla final.
8. Probar en la barra lateral (tamaño pequeño) y en escala de grises.
9. Documentarlo: README (lista de juegos, tabla de controles, estructura), `description` de
   `package.json`, descripción del ajuste `arcade.bots` si usa bots, y una sección "claves" aquí.

### Red y relé

- Invitado: oferta WebRTC sin trickle (espera ICE ≤ 2 s); si en `P2P_TIMEOUT_MS` (7 s) no abre el
  canal, pide relé (`action: "relay"`) y sigue por HTTP. `join` con `offer: null` = sin WebRTC.
- Relé (`src/game/net/relay.ts`): `RELAY_HZ` = 10, hasta `RELAY_MAX_IN_FLIGHT` = 3 peticiones en
  paralelo, keepalive 1 s (`RELAY_KEEPALIVE_MS`), desconexión a los 10 s sin noticias (`RELAY_STALE_MS`).
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

- **3D con Three.js**, 256×224 lógicos (`KW`×`KH`). Estilo redondeado (2026-10-21, a petición: «que no se vea cuadrado»): nada de cajas,
  todo con cápsulas, cilindros y esferas de sombreado suave (`models.ts`), igual que el casino. Piezas:
  - `stage.ts` (`Stage`, escena de un circuito; se rehace al cambiar de circuito y libera con `disposeScene`),
    `models.ts` (kart brillante con ruedas que giran y poroto al volante, decorados, montañas y nubes de bolas, objetos),
    `tunnel.ts` (cueva), `render.ts` (cámara, HUD, minimapa, resultados). Coordenadas del juego × `S` (0,05).
  - Suelo: `trackCanvas` (lienzo TEX×TEX, manchas redondas, flores/ondas/destellos según el tema) sobre el relieve de `terrain.ts`
    (`heightAt`, solo visual salvo lo de abajo); sombreado suave. Decorados **instanciados** (un dibujo por tipo; los que tapan la
    vista se ocultan poniendo su matriz a cero). Cámara detrás del kart; FOV más abierto con turbo/estrella; más alta en los saltos.
- **5 temas** (`track.ts: THEMES`; el circuito sale de la semilla): Pradera, Desierto, Nieve, **Espacio** (estilo Rainbow Road) y **Volcán** (estilo castillo de Bowser).
  - Espacio (`theme.void`, `space.ts`): la pista es una cinta de neón que flota (bordes que recorren el arcoíris, estrellas en la textura), con estrellas,
    nebulosas, planetas y sol; decorados flotantes (cristales brillantes, asteroides); desnivel ×1,8; sin túneles ni muro invisible. **Salirse del asfalto
    es caer** (`Kart.fall`, `checkVoid`): al pasar `FALL_LIMIT` Lakitu recoge al kart (`respawn`: `RESPAWN_BACK` puntos antes del último tramo seguro,
    baja en una nube `DROP_TIME` s). El invitado simula su propia caída; el anfitrión ve `z` negativa en la fila de red.
  - Volcán (`theme.lava`): suelo de basalto con grietas, lava animada bajo el nivel de la pista más baja (nunca la inunda; `buildLava`), montañas con
    cima de lava, antorchas con halo, brasas flotando; Nieve lleva copos. Las partículas (`buildAmbient`) dan vueltas alrededor de la cámara.
  - **Peligros** (`hazards.ts`, `track.hazards`, 3 por circuito según el tema: chomp con cadena, thwomp que cae a golpes, meteoro): su posición sale solo
    del tiempo de carrera (`hazardAt`), así anfitrión e invitados coinciden sin red; el anfitrión decide los golpes (`Race.updateHazards`, trompo si no hay
    estrella ni trompo en curso). El kart abre un ala delta en los saltos largos (`z > 14`).
- **Pulido (2026-10-21)**: **T** (anfitrión/local) cambia de circuito y empieza otra carrera (`Race.themeIdx`, en red `th` del estado; -1 = al azar).
  HUD: título del circuito en la salida, ruleta de objetos al recoger, aviso de vuelta / «¡ÚLTIMA VUELTA!» y «¡CONTRAMANO!». Humo blanco al derrapar y polvo
  fuera de pista (sprites en `Stage.puff`). Monedas reaparecen cada vuelta (`Kart.lap`). Frenar corta el turbo.
  - Lecciones de las pruebas con piloto automático (hacerlas otra vez si se toca la física): en el espacio los karts caían ~20 veces por carrera. Causas: (1) tras
    Lakitu la búsqueda de tramo (`locate` con pista de ±30 puntos) se quedaba lejos y volvía a caer: `respawn` ahora fija `seg`/`segT` y ajusta el progreso;
    (2) placas de turbo antes de curvas cerradas: ahora exigen recta larga (`turnOver(i, 56)`) y la IA mira más lejos con turbo; (3) rampas con curva en el
    aterrizaje: ahora 40 puntos rectos (48 en el espacio); (4) cinta del espacio más ancha (`RIBBON_HW`, `FALL_DIST`) con roce en el borde.
  - Billar: una partida de CPU podía quedarse sin bolas en la mesa y no acabar nunca; `resolve` ahora cierra la partida si no queda ninguna bola de juego.
- **Rampas, placas, monedas y túnel** (`track.ts`, `placeFeatures`, sale de la semilla con `Rng(seed ^ 0xfea7)`: no viajan por la red):
  - Rampa (`track.ramps`, hasta 2, en tramos rectos de 36 puntos): al pasar por el labio (`RAMP_LEN` puntos tras `i`) a más de
    `RAMP_MIN_SPEED` el kart sale volando (`Kart.z`, `vz`, gravedad `GRAVITY`). En el aire gira poco, no acelera, y **SHIFT hace un
    truco** (campana) que da `TRICK_BOOST` s de turbo al aterrizar. `stage.ts: rampLift` sube visualmente al kart por la cuña.
  - Placas de turbo (`track.pads`, flechas aditivas): `PAD_TIME` s de turbo al pisarlas. Monedas (`track.coins`): cada jugador recoge
    las suyas (`Kart.taken`, no se sincronizan), hasta `MAX_COINS`; cada una da `COIN_SPEED` de velocidad máxima.
  - Túnel (`track.tunnels`, 1 por circuito, ~30 puntos): arco de roca con portales y cristales de colores; por dentro oscurece la
    luz del día (`Stage.dark`) y la pared está pegada al asfalto (`TUNNEL_LIMIT`, en `updateTrackPosition`).
- Objetos (`config.ts`, `race.ts`): turbo, plátano, caparazón verde, **caparazón rojo** (teledirigido: sigue la pista hacia el de delante),
  **estrella** (invencible y rápida `STAR_TIME` s), **bomba TNT** (caja de Crash; se arma a los 0,6 s, explota por contacto o a los
  `BOMB_FUSE` s, radio `BOMB_RADIUS`) y **rayo** (frena a los que van delante `BOLT_TIME` s; solo sale si no vas primero). Los de atrás
  reciben más estrellas, rayos y rojos (`randomItem`).
- Red: filas de `k` del anfitrión con `[x, y, a, v, progreso, golpes, objeto, puesto, tiempo, ¿IA?, z, rayos, efectos]` (efectos: bits
  1 estrella, 2 rayo, 4 turbo, 8 truco); `sh` caparazones `x,y,rojo`; `bm` bombas `x,y,mecha`; `ex` explosiones `x,y,edad`. El invitado
  manda también `z`. Estrella y turbo se aplican al instante en su pantalla; el rayo llega por `slowSeq` (como los golpes por `spinSeq`).
- Pruebas: `npm test -- karts` (rampa, truco, placa, monedas, túnel, 12 carreras de IA, los objetos nuevos).
- Circuitos (`track.ts`): 70 % "cuadrícula" (contorno de un poliominó en 7×7 casillas de 170) y 30 %
  "orgánico" (envolvente con hendiduras/lenguas/eses), suavizado Chaikin ×4, validación
  (radio ≥ 42, separación entre tramos ≥ `TRACK_W+WALL_MARGIN+16`, longitud 2.400–5.600),
  hasta 120 intentos y óvalo de emergencia. Meta en la recta más larga.
- Física (`physics.ts`): `a` = morro, `ma` = dirección de avance (se separan al derrapar),
  muro invisible a `TRACK_W/2 + WALL_MARGIN`, progreso en puntos de línea central (vueltas = progreso/n).
- Derrape: Shift/C (saltito → derrape si se gira); miniturbo al soltar (azul > 0,8 s, naranja > 1,7 s); giro derrapando = fracción de
  `STEER_RATE` (`DRIFT_TURN*`), cruce limitado a `DRIFT_MAX_SLIP`. La IA no derrapa.
- Red: **cada invitado simula su propio kart** (sin retraso) y envía posición; el anfitrión (`race.ts`) arbitra cajas, golpes, objetos y
  llegada. 3 vueltas, 4 corredores (IA rellena). IA: sigue la línea central con desvío propio y frena según el giro de los próximos ~150 u.

## 6b. Sumo de bolas (claves)

- Arena circular sobre lava; gana el último en pie (empate si caen a la vez o se acaba el tiempo, 60 s).
  Desde los 20 s la plataforma encoge (100 → 45). Victorias acumuladas entre rondas (R).
- **3D con Three.js** en estilo de bloques (antes era modo 7 por software). Cámara fija al sur, alta, mirando
  hacia abajo al norte (`CAM_*` en `config.ts`; sigue un poco al jugador de lado). Escena en `render.ts`
  (`Stage`), con las coordenadas del juego × `S` (0,1): x → x, y (hacia la cámara) → z, altura → y.
  - Plataforma: baldosas cuadradas de `TILE` (6 u.) que son columnas hasta la lava (un `InstancedMesh`);
    las que quedan fuera de `radius` caen girando (sin temblar antes: el usuario lo pidió así). Damero (`CHECKER`) y borde de piedra (`RIM_W`).
  - Lava: mar de cubos luminosos (`InstancedMesh`, `MeshBasicMaterial`) que suben y bajan con paleta cíclica.
  - **Bolas facetadas** (icosaedro de pocas caras, sombreado plano) con una franja clara para que se vea que
    ruedan; es la única excepción a "solo cajas" (decisión del usuario). Muñeco de bloques encima, mirando a
    la cámara, inclinándose según la velocidad.
  - Luz: sol con sombras + hemisférica (cielo morado, suelo naranja = resplandor de la lava). Paredes de roca,
    chispas y salpicaduras de cubitos con destello al caer una bola.
  - El HUD y el número sobre cada muñeco (proyectado con `projectTo`) son 2D.
- Red: **anfitrión autoritativo** (choques entre bolas); el invitado manda dirección + contador de
  embestidas (`{t:"b",x,y,d,s}`) y suaviza posiciones adelantándolas por la velocidad.
- IA: si su posición prevista se sale, vuelve al centro; si no, se coloca entre el rival y el centro y carga.
  Ajustada con simulación (300 rondas solo IA: mediana ~43 s, ~15 % por tiempo).

## 6c. Monigotes (claves)

- Vista lateral fija 320×200, 3 escenarios (`stages.ts`) con plataformas que se atraviesan desde abajo (↓ para
  bajar) salvo los suelos `solid`. Último en pie gana; KO por vida o por salir del escenario. 90 s.
- Sin sprites: monigotes de líneas con poses calculadas (`makePose`); ragdoll simple al morir (giro + rebote).
- Empuje de los golpes × `KNOCK_SCALE(hp)` (crece al perder vida) con rozamiento del aire al salir despedido.
  Armas en cajas cada 5 s: espada, pistola (8 balas), bomba (2). Al morir se suelta el arma.
- Red: anfitrión autoritativo como Sumo; el invitado manda `{t:"f",x,d,j,a,s}` (contadores de salto/ataque).
- Ajustado con simulación (600 rondas solo bots: mediana ~17 s, ~15 % por tiempo, mezcla de caídas y KO).

## 6d. Ruleta de cartuchos (claves)

- Por turnos. 3 rondas (`ROUNDS`: 2/4/5 vidas, 0/2/4 objetos por carga; en la 3.ª con ≤ `CUT_AT` vidas no hay
  curas). Carga de 2–8 cartuchos con al menos uno de cada; se enseña cuántos hay y luego se cargan en orden
  oculto. Dispararse con fogueo = repite turno; sierra = daño 2. Esposas: el esposado se salta un turno
  (`cuffed` 1 → 2) y no se le puede volver a esposar hasta que juegue. Adrenalina: roba y usa al momento.
- `match.ts` es el árbitro: cada acción arranca una animación (`anim`) y su efecto se aplica a mitad
  (`SHOT_HIT`/`ITEM_HIT`); el cambio de turno y la carga nueva esperan a que termine (`afterAction`).
  El último evento viaja como `ev = [n, tipo, a, b, c, d, e]` y el render anima con `et` (tiempo desde él).
- **Secreto**: el orden de los cartuchos nunca sale del árbitro. El estado (`state.ts`) solo lleva lo que cada
  uno sabe (`kn`: posición desde la recámara + real). El bot (`bot.ts`) cuenta lo que queda y usa solo su `known`.
- Red: el invitado elige en su pantalla (`Picker`, compartido con el anfitrión) y manda `{t:"r",i,k,a,b,c,s}`;
  `i` crece con cada acción y se reenvía hasta verlo en `snap.ak[índice]` (el anfitrión ignora `i` ya vistos).
  Sin acción pendiente manda lo mismo cada `RELAY_KEEPALIVE_MS` para no caducar por el relé.
- 3D con **Three.js** (WebGL; también Sumo y Karts). `three` está en `devDependencies` porque esbuild lo mete en el
  paquete (la web pasa de ~157 KB a ~710 KB). Un solo `WebGLRenderer` para todo el hub (`core/three.ts`; los
  navegadores limitan los contextos); `renderInto` dibuja en un lienzo aparte a `tamaño lógico × escala de
  píxeles` (máx. ×3) y lo copia con `drawImage` al lienzo del juego, y encima va el HUD 2D. Por eso el `draw` de
  estos juegos recibe `pixelScale` (en `main.ts` local: `draw: (c, s) => game.draw(c, s)`). La escala de grises
  (filtro CSS) sigue funcionando. Sin WebGL, muestra un aviso y el HUD.
- Escena (`Stage` en `render.ts`): se construye una vez y en cada frame solo se recoloca. Luces: foco de la lámpara
  con sombras, bombilla omnidireccional (ilumina las caras), hemisférica tenue, luz suave junto a la cámara y
  destello del disparo. Halos (sprites aditivos) en lámpara, ojos del crupier y fogonazo; humo y polvo en el haz.
- Las poses se calculan con `math3d.ts` (guiñada/cabeceo/alabeo = Euler "YXZ" de Three).
- Cámara en primera persona desde tu asiento; los asientos se reparten en círculo a partir de ti (`angleOf`).
- Probado con simulación (300 partidas solo bots por tamaño: 2 jugadores ~3 min de mediana, 4 jugadores ~8;
  ninguna atascada; se usan los 9 objetos) y con capturas de escenas fijas en Edge sin ventana.

## 6g. Bloques (claves) — base; se irá ampliando (inventario, crafteo...)

- Mundo fijo de `WX×WY×WZ` = 96×48×96 en un `Uint8Array` (`world.ts`), generado desde la semilla con ruido de valor
  fractal (`fbm`): llanura + colinas + montes (cima de piedra si h > 30), agua hasta `SEA` (17), arena solo en la
  orilla y el fondo (h ≤ SEA), árboles por `hash3`. Roca madre en y = 0. Bordes: pared invisible (`solidAt`).
  19 tipos en `blocks.ts` (`BLOCKS`: casillas del atlas arriba/lado/abajo, `solid`, `opaque`, `light`, `shape`). La
  barra del creativo (`HOTBAR`) es fija (con antorchas).
- **Cuevas y menas** (petición del usuario 2026-10-20, con horno, minerales y antorchas), con `Rng(semilla·7+3)` tras el
  relieve: primero vetas que solo sustituyen piedra (`ores`: carbón 130 vetas de 9 hasta y 44, hierro 90 de 6 hasta
  y 30, diamante 16 de 4 hasta y 10), luego 18 túneles serpenteantes (`caves`: radio 1,3–2,5, 50–140 pasos, alguna
  sala de radio 3,5–5,3; los 6 primeros empiezan en la superficie y bajan: son las entradas) y por último los árboles.
  No se vacía nada pegado al agua (nunca queda agua sobre un hueco) ni la roca madre. ~25 ms el mundo entero.
- **Luz** (`world.light`: cielo en los 4 bits altos, antorchas en los bajos, 0–15): el cielo baja recto por cada
  columna hasta lo opaco (hojas y agua restan 1) y luego se reparte como la de las antorchas (14): −1 por bloque, −2
  por hojas y agua, con una cola por niveles (cada casilla se fija una vez). Es perezosa: `set` apunta la zona
  (±15 en x y z, toda la altura) y `flushLight` la recalcula (la llama el render antes de mallar); la luz de fuera de
  la zona entra por el borde. Solo se marcan los chunks donde la luz cambió. Tiempos (solo, en Node): todo el mundo
  ~35 ms, un cambio ~2 ms. Las simulaciones en Node no la calculan nunca.
- `world.diff` guarda los bloques distintos de los generados (para la base de red) y `world.dirty`, los chunks que
  hay que rehacer. El jugador aparece en tierra seca (`dryColumn`, en espiral desde el centro).
- Malla (`mesher.ts`, código puro): chunks de 16×48×16, solo caras visibles, oclusión ambiental por vértice
  (`AO_LEVEL`), sombra fija por cara y la luz del mundo horneadas en el color del vértice: la luz es la media de las
  casillas de delante que no tapan (suave), con la curva `brightness` (a oscuras casi negro) y la de las antorchas
  en tono cálido (`WARM`). Las antorchas son un palito de 2/16 (en una pared, inclinado con el pie pegado a ella,
  según `torchSupport`) y siempre brillan. Cada cuadrado se parte por la diagonal de las
  esquinas oscuras (al revés salían triángulos claros sueltos). El agua va aparte (transparente, superficie a 0,88).
  ~4 ms por chunk; la carga inicial se reparte (`CHUNKS_PER_FRAME`) y los cambios se rehacen al momento.
- Render: `MeshBasicMaterial` con el atlas (`NearestFilter`, sin mipmaps, `alphaTest` para hojas y cristal,
  `toneMapped: false`): el mundo no usa luces ni sombras (barato). Solo los muñecos y animales llevan luz, y sus
  materiales se oscurecen según la luz de donde están (`brightnessAt`, `shadeMaterials`).
  Atlas de `ATLAS_COLS×ATLAS_ROWS` = 8×4 casillas de 16 px dibujado píxel a píxel (`atlas.ts`; para una casilla nueva,
  su `T_...` en `blocks.ts` y su caso en `pixel`). Icono isométrico de la barra: `drawBlockIcon` (la antorcha, plana).
  Son cubos de 1 m: encaja con la regla 6e (no son vóxeles finos).
- Física (`player.ts`): caja de 0,6×1,8, eje a eje en pasos ≤ 0,45 y pegada a la cara al chocar; nado; vuelo (F).
- Ratón: `pointer lock` al hacer clic en el lienzo (`input.ts`; las escuchas se enganchan una sola vez y no tocan el
  DOM hasta el primer `poll`); `releasePointer` al abrir el menú o el selector. Sin ratón: flechas para mirar y Q/Enter.
  **La webview de VS Code sí captura el puntero** (lo confirmó el usuario el 2026-10-19): el juego se diseña con ratón.
- Dos entradas en el hub con las mismas clases: `"blocks"` (creativo) y `"survival"` (`BlocksMode`; el `snap.g` y el
  `id` del invitado dicen cuál). Esc pasa primero por `escape()` del juego (`HostGame`/`GuestGame`/`Screen`, opcional):
  si cierra un inventario, no se sale al menú.
- **Supervivencia** (petición del usuario: "lo básico, romper, craftear"):
  - Romper: mantener; el progreso es `dt × velocidad / BLOCKS[b].hard` (s a mano). Con la herramienta de su `tool`,
    `TOOL_SPEED` (madera ×5, piedra ×9, hierro ×12, diamante ×16). `needsTier`: sin una herramienta de ese nivel se
    rompen pero no sueltan (`dropOf(b, nivel)`): piedra, adoquín, ladrillo, carbón y horno piden pico de madera, el
    hierro de piedra y el diamante de hierro. Hierba → tierra, piedra → adoquín, carbón → carbón, hierro → la mena
    (se funde), diamante → diamante, hojas y cristal → nada. Menas: 15 s a mano (pico de piedra 1,7 s). Grietas: tira de 5 fases (`crackCanvas`)
    en una caja algo mayor que el bloque. Medido: tronco a mano 3 s, piedra a mano 7,5 s, con pico de madera 1,5 s.
  - **Objetos en el suelo** (`drops.ts`): lo roto cae como cubito (bloques) o sprite (palos, herramientas), flota y
    gira; se recoge a ≤ 1,5 bloques tras 0,4 s (quien lo tiró, tras 1,5 s). Q tira uno (Ctrl+Q el montón); clic fuera
    del panel del inventario tira lo que llevas en la mano; lo que no cabe al cerrar el inventario también se tira.
    Montones iguales cercanos se juntan; caducan a los 300 s; máx. `MAX_DROPS` (96, se quita el más viejo).
    **Solo los simula el anfitrión** y él decide quién recoge cada uno: al romper, el cambio lleva lo que suelta
    (6.º número); tirar viaja en la misma cola de acciones del invitado (`[k, -1, objeto, cantidad, 0, 0]`). Al
    invitado se le entrega lo recogido como `gr` (lista numerada por jugador) hasta que confirma con `g`; si no le
    cabe, lo vuelve a tirar. Al desconectarse, sus entregas sin confirmar vuelven al suelo. El estado lleva los
    objetos en `dr` (id, objeto, cantidad, x, y, z). Probado: simulación de 10 min con anfitrión + invitado
    rompiendo, poniendo y tirando al azar, por directo y por relé con pérdidas: soltados = puestos + inventarios +
    suelo + caducados, exacto (no se duplica ni se pierde nada).
  - Poner gasta una unidad.
  - **Animales** (`mobs.ts`, petición del usuario 2026-10-20: "vacas, cerdos, etc. que se puedan matar"): vaca,
    cerdo, oveja y gallina (`MOBS`: tamaño, vida 10/10/8/4, velocidad paseando/huyendo, botín). Usan la física
    del jugador con su caja (`stepBody(..., size)` y `Move.speed`). Pasean (45 % anda, 2–6 s por decisión),
    saltan escalones de 1, giran ante paredes y, paseando, no se meten en el agua ni bajan más de 3 bloques; la
    gallina cae despacio. Aparecen `MOB_TARGET` (16) en manadas de 2–4 sobre hierba, deterministas con la semilla
    (`populate`); cada `RESPAWN_EVERY` (20 s), si faltan, sale otra manada a ≥ `SPAWN_MIN_DIST` (20) de los
    jugadores. Golpe (`hit`): resta vida, empuja, destello rojo `HURT_TIME` (0,4 s, sin recibir más golpes) y huye
    `PANIC_TIME` (5 s); al morir suelta el botín en `drops` y cae de lado `DEATH_TIME` (0,8 s). Daño
    (`attackDamage`): a mano 1, espada 4/5, hacha 3/4, pico y pala 2/3. Botín: ternera 1–3 + cuero 0–2, chuleta
    1–3, cordero 1–2 + lana 1, pollo 1 + plumas 0–2.
  - Golpear: `Pilot` lanza el rayo a los animales (`rayMobs`, caja algo mayor) hasta `ATTACK_REACH` (3,5) o el
    bloque apuntado; si da a uno, `mobTarget` tapa al bloque. Un clic (o mantener) golpea cada `ATTACK_COOL`
    (0,45 s); los golpes salen en `pilot.hits` y el juego aplica el daño de lo que hay en la mano. En red el
    invitado los manda en su cola como `[k, -2, animal, objeto]`; el anfitrión calcula el daño y exige que esté a
    `ATTACK_REACH + 2,5`. El invitado se ve el destello al momento (`flash`). Estado: `mb` (id, tipo, x, y, z,
    guiñada, 0/1 golpeado/2 muerto), ~1,3 KB con 17 animales.
  - Modelos (`buildBeast` en `render.ts`): cajas con `MeshLambertMaterial` propios de cada animal (el destello es
    `emissive`); patas en cruz, la cabeza baja a pastar parado. Para añadir uno: entrada en `MOBS`, su rama en
    `buildBeast` y, si suelta algo nuevo, el objeto en `items.ts` y su dibujo en `LOOT` de `icons.ts`.
  - **Vida y hambre** (`vitals.ts`, petición del usuario 2026-10-20: "daño, vida y hambre"), como el modo normal de
    Minecraft: 20 de vida y 20 de hambre (10 iconos), 10 burbujas de aire. Daño: caída de más de `SAFE_FALL` (3)
    bloques, 1 por bloque (el agua la anula; se mide desde lo más alto del salto); sin aire, 2 por segundo; con el
    hambre a 0, 1 cada 4 s hasta dejar 1 de vida (el hambre no mata). El hambre baja por cansancio (4 = un punto):
    0,05/s parado (un punto cada 80 s), 0,03 por bloque andado, 0,1 por salto o golpe, 0,025 por bloque roto. Con
    hambre ≥ 18 se cura 1 cada 4 s (cuesta 3 de cansancio). Comer: clic derecho mantenido `EAT_TIME` (1,6 s) con
    comida en la mano (`itemInfo(id).food`, como Minecraft: ternera y chuleta crudas 3, cordero y pollo crudos 2;
    filete y chuleta asada 8, cordero y pollo asados 6). Daño: pantalla roja y cámara ladeada `HURT_FLASH` (0,5 s).
  - **Morir** (`Pilot.die`): cierra la pantalla abierta y suelta todo el inventario a sus pies (`throws` con
    `spill`); la cámara cae al suelo con el cartel "HAS MUERTO". Tras `RESPAWN_DELAY` (1 s), ESPACIO o clic: vuelve a
    su punto de salida con todo lleno. La vida y el hambre son locales (como el inventario); por la red solo va
    que está muerto: el invitado lo dice con `d: 1` y suelta lo suyo en su cola (`[k, -1, objeto, cantidad, 1, 0]`).
    Mientras está muerto, el anfitrión no lo dibuja (fila de `p` vacía) ni le da objetos. El invitado no reaparece
    hasta que el anfitrión ha confirmado lo soltado (`holdRespawn`): así cae donde murió y no en el punto de salida.
  - HUD: corazones a la izquierda y muslos a la derecha encima de la barra, burbujas encima de los muslos bajo el
    agua (iconos de 7×7 dibujados con `pixels` en `render.ts`); tiemblan con poca vida o sin hambre; barrita bajo la
    cruz al comer. El nombre del objeto y los avisos suben por encima; la etiqueta de red va bajo los jugadores.
  - **Monstruos** (`mobs.ts`, petición del usuario 2026-10-20: "mobs hostiles", con el ciclo de día y noche): zombi
    (20 de vida, pega 3), esqueleto (20, flechas de 3 cada 2 s hasta 14 bloques; se aparta si te acercas a menos de
    5), araña (16, pega 2, salta hacia ti) y petardo (20; a menos de `FUSE_DIST` se enciende `FUSE_TIME` 1,5 s y
    explota: rompe bloques en radio `BOOM_RADIUS` 2,6 —un 30 % suelta algo—, hasta 14 de daño a 6 bloques y empuje;
    si te alejas, se apaga). Persiguen al jugador vivo más cercano a ≤ `FOLLOW_DIST` (16) y solo pegan o disparan si
    lo ven (rayo entre los ojos: una pared protege). Aparecen cada 0,5 s (máx. `HOSTILE_MAX` 10) a 16–36 bloques de
    un jugador, sobre bloque opaco con 2 de hueco y con luz ≤ `SPAWN_LIGHT` (7) contando el cielo según la hora
    (`Mobs.lightNow`, `skyLevel`: de noche el cielo pleno vale 4): de noche fuera y siempre en las cuevas; las
    antorchas (14) lo impiden alrededor. Zombis y esqueletos arden a pleno sol (1/s). Desaparecen a más de 48 de
    todos. Sueltan carne podrida (se come, 2), hueso, flecha, hilo o pólvora (sin uso todavía). Sus golpes salen en
    `mobs.events` (`hurt`, `boom`) y los aplica el juego: `hurtPlayer` (0,5 s de respiro por jugador; al anfitrión
    directamente con `Pilot.knock`) y `explode` (rompe bloques con `apply`, como cambios del registro). Modelos de
    cajas en `buildBeast`; el petardo encendido parpadea en blanco y se hincha, los que arden brillan en naranja.
    En las pruebas que no los quieren: `mobs.hostiles = false`.
  - **Día y noche** (`daycycle.ts`): `DAY_LENGTH` 600 s, empieza por la mañana (`MORNING`). `daylight` (0–1) sale de la
    altura del sol; el anfitrión lleva el reloj (también en creativo) y viaja en cada estado (`dc`). Render: la
    malla guarda aparte la luz del cielo (color) y la de las antorchas (`blockLight`) y el shader (`skyLit`,
    `onBeforeCompile`) multiplica la del cielo por `skyFactor` (de `NIGHT_SKY` 0,2 a 1) y se queda con la mayor: la
    noche no rehace mallas. Cielo y niebla pasan de azul a noche con atardecer anaranjado; bajo tierra se apagan
    (`cave`). Sol y luna giran alrededor de la cámara y hay estrellas de noche; las luces de los muñecos siguen al sol
    o a la luna, y animales, monstruos y muñecos se oscurecen con `brightnessAt(..., skyFactor)`.
  - Red de los monstruos: van en `mb` con estado 3 (mecha) y 4 (ardiendo); flechas en `ar` y explosiones recientes en
    `bx` (para dibujarlas). Un golpe a un invitado va en `hd` (id, daño, empuje) hasta que lo confirma con `hk`; se
    aplica una sola vez. Probado en la prueba de red, que en supervivencia empieza a medianoche.
  - Inventario (`inventory.ts`): 36 ranuras (0–8 barra), montones según `itemInfo(id).max` (herramientas 1). Objetos
    (`items.ts`): los bloques con su número y, desde 100, palo, herramientas (sin durabilidad todavía) y lo que
    sueltan los animales.
  - Crafteo (`crafting.ts`): recetas con forma, recortadas al bloque usado y aceptadas reflejadas. 2×2 desde el
    inventario (E/Tab/I) y 3×3 con clic derecho sobre una mesa de trabajo (bloque `TABLE`, casillas 14–15 del atlas).
    Recetas: tronco → 4 tablones, 2 tablones → 4 palos, 4 tablones → mesa, 8 adoquines en anillo → horno, carbón (o
    carbón vegetal) sobre palo → 4 antorchas y pico/hacha/pala/espada de tablones, adoquín, lingote de hierro o
    diamante (`tools`). Para añadir una: una línea en `RECIPES`. Lo que se funde va en el horno (`SMELT`).
  - **Horno** (`furnace.ts`, bloque `FURNACE`, clic derecho): entrada, combustible y salida. `SMELT`: mena de hierro →
    lingote, arena → cristal, adoquín → piedra, tronco → carbón vegetal, carne cruda → cocinada; `SMELT_TIME` 5 s por
    objeto. `FUEL` (s de fuego): carbón y carbón vegetal 40 (8 objetos), tronco/tablón/mesa 7,5, palo 2,5, herramientas
    de madera 5. Solo enciende otro combustible si hay algo que fundir; sin fuego lo fundido a medias se enfría. Es
    **de cada jugador**, como el inventario: `Pilot.furnaces` ("x,y,z" → `Furnace`), y todos funcionan aunque la
    pantalla esté cerrada; por la red solo va el bloque. Si alguien rompe el horno, lo de dentro vuelve al inventario
    de su dueño (o al suelo si no cabe). La pantalla es la de crafteo (`Crafter` con `size = "furnace"`): sus ranuras
    son las del horno (no se vacían al cerrar), la salida solo se coge, Mayús+clic desde el inventario manda a la
    entrada lo que se funde y al combustible lo que arde; llama y flecha de progreso.
  - **Antorchas** (`TORCH`, luz 14): no chocan; se ponen apoyadas en el suelo o en una pared (`torchSupport`; lo
    comprueban el piloto y `validEdit`). Al romper un bloque, el anfitrión tira las antorchas que se quedan sin apoyo
    como un cambio más del registro (sueltan la antorcha).
  - Pantalla (`craftui.ts`, `Crafter`): con ratón como en Minecraft (clic coge/deja/junta/cambia, clic derecho la
    mitad/uno, Mayús+clic mueve barra ↔ mochila o fabrica todo). Con la pantalla abierta, `setUi(true)` suelta el
    puntero y los clics llegan en unidades lógicas (`logical`, con `getBoundingClientRect`); al cerrar, lo de la
    cuadrícula y la mano vuelve al inventario. Para volver a mirar con el ratón hay que hacer clic otra vez (el
    navegador solo deja capturar el puntero tras un clic).
  - El inventario es local de cada jugador (no viaja por la red ni se guarda); la red solo lleva los bloques.
  - Probado: en Node el ciclo completo con clics reales sobre las ranuras (talar, tablones, palos, mesa, ponerla,
    usarla, pico, piedra con y sin pico), la red en los dos modos y capturas de grietas, barra e inventario.
- Red: cada uno mueve a su jugador (sin retraso). Cambios de bloques: el anfitrión los numera (`n`) en un registro y
  cada estado lleva los últimos `EDITS_IN_SNAP` (`ed`). El invitado predice los suyos y los reenvía con su `k` hasta
  verlo en `ak`; si le faltan cambios, usa la base (`{seq, n, d}` = diff completo, renovada como mucho cada
  `REBASE_EVERY` s si hubo cambios). Mensaje `{t:"m",x,y,z,a,p,h,e,s}` ≤ ~160 caracteres. `finished` siempre es true.
  La base crece ~16 caracteres por bloque cambiado (con el límite del relé de 200.000, unos 12.000 bloques).
- Probado: `npm test` (test/blocks-*.test.ts: supervivencia completa, objetos del suelo, animales, vida y hambre,
  red creativo y supervivencia por directo y por relé con pérdidas y muertes al azar: mundos idénticos, todo
  confirmado, objetos que cuadran, mismos animales; mundo: cuevas, menas, luz, antorchas y horno) y
  `npm run shot -- test/browser/survival.mjs`, `mobs.mjs`, `vitals.mjs`, `caves.mjs` o `night.mjs` (capturas). Los
  monstruos y la hora, en test/blocks-hostile.test.ts. El primer clic de CDP sí captura el puntero en Edge sin ventana.

## 6h. Casino de deudas (claves) — versión sencilla, se irá ampliando

Petición del usuario (2026-10-19): algo como *Gamble With Your Friends* (casino cooperativo de 2026), empezando simple.

- Carpeta `src/game/casino/`: `config` (tamaños, tiempos, máquinas y tablas de premios), `floor` (simulación:
  `Casino`), `input`, `render` (2D), `game` (`CasinoHost`/`CasinoGuest`). Id del hub `"casino"`. Sala 320×200 vista
  desde arriba: pared con el prestamista, 8 tragaperras contra la pared, 2 mesas de "Doble o nada" y 1 de dados.
- Reglas: **banco común** (empieza en `START_BANK` = 100). Día = cartel (`PH_INTRO`), `DAY_TIME` 90 s jugando
  (`PH_DAY`), cierre (`PH_COLLECT`, las jugadas en marcha terminan), y si el banco llega a `quotaOf(día)`
  (120 × 2,1^(día−1)) se paga (`PH_PAID`) y empieza otro día; si no, fin (`PH_OVER`, `finished`). R: otra partida.
- Máquinas: se juega desde una franja delante (`machineAt`), ESPACIO apuesta y la ocupa `dur` + `SHOW_TIME`. El
  anfitrión decide la tirada al empezar (`play`) y el premio entra al banco al terminar. Tragaperras $10 (EV ≈ 1,29,
  poca varianza: cereza $5, pareja $10, 2 cerezas $20, trío ×4–×25), Doble o nada $50 (50 %, paga $110, EV 1,10),
  Dados $100 (2d6: 12 ×12, 11 ×5, 9–10 ×2, 7 devuelve; EV 1,17). Las tres pagan algo más de lo que cuestan: la
  dificultad es la varianza y la cuota que crece. Afinado con `test/casino.test.ts`: jugando con cabeza (apuesta
  ≤ ¼ del banco), solo se pierde el día 1 un ~10 % (mediana 2 días); entre 4, mediana de 6 días.
- Al tocar premios o cuotas, volver a pasar `npm test -- casino` (mira el EV y la mediana de días).
- Red: mensaje `{t:"c", x, y, u, s}` (u = contador de pulsaciones); estado ~200 caracteres (`p` jugadores, `m`
  máquinas `[usuario, t, premio, ...resultado]` o `[-1]`). El invitado adelanta `t` y el reloj entre estados.
- Ideas para crecer (como el original): objetos y tienda (amuletos que cambian probabilidades), más pisos con
  máquinas más caras, eventos del prestamista, ruleta y cartas, deuda que crece si no se paga entera.

## 6i. Casino: economía, ventanilla, rondas, borrachos y mecanismos (2026-10-21)

Petición del usuario: convertir el casino en una experiencia cooperativa de riesgo con cinco rondas. **Esto sustituye los
turnos con cuota de 6h** (la parte de máquinas/mesas de 6h está obsoleta: ahora hay 12 mesas en dos pisos).

- **Todo el balance en `casino/balance.ts`** (`TIERS`, `ROUNDS`, `LIMITS`, `params(ronda, jugadores)`, `goalFor`, `jailLoss`):
  monedas iniciales (100), tope/límite por nº de jugadores (100/50, 180/90, 240/120, 300/150 en la ronda 1; límite =
  mitad del tope), `capMul` por ronda, retorno `ret`, guardias, borrachos, cárcel, mecanismos. Las fórmulas pasan por
  `clamp` con cotas de `LIMITS`. La interfaz, la escena y el anfitrión leen de ahí; no hay números sueltos.
- **Dinero**: cartera (`chips`: se roba, se gasta, la cárcel le quita el 50 % una vez por captura) y **depósito**
  (`win.stake`, en la ventanilla: es lo único con lo que se apuesta en las mesas y está a salvo de la cárcel). Al acabar
  la ronda el depósito vuelve a la cartera. `Ventanilla.deposit` valida todo (saldo, límite, tope, reja/alarma, vigilancia,
  operación repetida) y no toca nada si falla; el anfitrión las procesa una a una.
- **Mesas** (`table.ts`): pagan `apuesta × (premio − 1) × ret` de ganancia (ret baja de 1,4 a 0,85 en las rondas, aunque
  el tope suba). `interrupt()` (borracho) quita solo las apuestas ya confirmadas, una vez; `blocked` para el reloj y las apuestas.
- **Rondas**: `CasinoHost.startRound/endRound`. Objetivo = cartera+depósitos del equipo ≥ inicio × (1+crecimiento). Si falla:
  la casa cobra (todos presos, 100 monedas, ronda 1). Tras la 5: `bossGate` y `onBossReady` (punto de extensión de la fase 2).
- **Guardias**: `setGuardsOn(rp.guards)` (4 = dos por piso en la ronda 1), velocidad, insistencia (`chaseMul`), vista
  (`sightMul`), pausa de ronda y condena escalan por ronda (`npc.ts`: `sightMul/chaseMul/pause`, estado `NPC_LURED`).
- **Borrachos** (`drunk.ts`, reutilizan el andar de `npc.ts`): WALK → SIT (bloquea la mesa) → LEAVE; «Apartar» (E, `pushDrunk`)
  los duerme (ASLEEP → GROGGY → vuelven o se van). Recarga `PUSH_CD`, éxito `drunk.push` por ronda.
- **Mecanismos** (`mech.ts`, posiciones en `world3d.ts`): ronda 2 palanca (reja de la ventanilla), ronda 3 timbre (atrae a los
  guardias de la planta baja) + ventanilla vigilada, ronda 4 alarma (bloquea la ventanilla; secuencia de botones del
  mirador), ronda 5 todo junto.
- **Red**: acciones nuevas del invitado `ca` 100 (depositar, `dv`), 101 apartar, 102 palanca, 103 timbre, 104 botón (los 40–57
  son basura: no reutilizar). Estado nuevo: `sk dp vn mc bk dk pc ne bs`; los avisos viajan como sucesos numerados `ne`
  (`events.ts`), así que host e invitados muestran el mismo texto una sola vez.
- **Pruebas**: `npm test -- casino` (`casino-balance`: economía y simulación de calibrado; `casino-host`: partidas de 1–4,
  cárcel, borrachos, rondas, mecanismos e invitado). Capturas: `npm run shot -- test/browser/casino.mjs` (dibuja varias veces
  antes de capturar: la cámara se suaviza). Si se toca el balance, volver a mirar la tabla de calibrado que imprime `casino-balance`.

## 6j. Dead Zone: Outbreak en el hub (2026-10-21)

Portado desde la carpeta hermana `DeadZoneOutbreak` (FPS de un jugador con Vite, HUD en HTML y renderer propio) a
`src/game/deadzone/` como juego del hub con multijugador (id `deadzone`, 1–4 jugadores). La carpeta original no se tocó.

- **Cambios al portar**: Three.js sale del renderizador compartido (`stage.ts` → `renderInto`, lienzo 320×240); el HUD pasa
  a canvas 2D (`hud.ts`); la entrada usa el `Keyboard` del hub y su propio ratón (`core/input.ts`, Pointer Lock o arrastrar);
  se quitó el cargador GLTF opcional de armas; `Interactions` es por jugador (`PlayerCtx` = puntos + armas).
- **Red**: el anfitrión (`DeadZoneHost`) simula TODO (zombis, rondas, armas y puntos de cada jugador, compras, puertas,
  barricadas, daño). Cada invitado es dueño de su cuerpo y mirada (latido `DzMsg` cada 60 ms con banderas gatillo/apuntar/usar)
  y manda acciones `ca` (1 clic, 2 recargar, 3 usar, 4 ranura); el anfitrión dispara desde SU posición y mirada con SU
  munición, y calcula los precios (no se fía del cliente). Estado `DzSnap`: `pl pt wp zb rd dr wn bx ne ov`; avisos
  como sucesos numerados `ne` (`Feedback` los convierte en HUD/sonido igual en anfitrión e invitado). Los invitados dibujan los
  zombis con `Zombie.puppet` (misma pose, sin IA) y los disparos ajenos por el contador `fs`.
- **Reglas de equipo**: zombis y cupo escalan con los jugadores (`tuneFor`); cada zombi persigue al jugador en pie más
  cercano; el caído reaparece al acabar la ronda (pistola, mismos puntos); sin nadie en pie, fin (R reinicia).
- Los juegos pesados pueden definir `dispose()` (liberar GPU): `main.ts` lo llama al volver al menú o cambiar de juego.
- **Entrada por ventanas (arreglado el 2026-10-21)**: los zombis nacían fuera del recinto y no llegaban nunca; eran dos
  fallos a la vez. (1) La rejilla de rutas miraba el centro de cada celda y los muros de 0,35 m caben entre dos centros
  de 0,5 m, así que las rutas atravesaban las paredes y los zombis se quedaban empujándolas (ver §7). Ahora se cierra
  toda celda que solape el colisionador engordado con el radio del cuerpo, y sin ruta hasta el jugador van a la ventana
  exterior más cercana a la que sí se llega (`Zombie.pathToWindow`). (2) El alféizar (`window`) los frenaba, así que ni
  rompiendo la barricada podían entrar: ahora el zombi lo ignora (trepa) y lo que cierra el hueco mientras queden
  tablones es el colisionador `barricade` (se apaga en `paintPlanks`). Al cruzar, el alféizar les tapa las piernas un
  instante (geometría de cajas: con 1,15 m de alféizar y un dintel a 1,95 m no cabe un cuerpo entero de pie); se aceptó
  ese recorte antes que cambiar el arte de las ventanas, que es lo que impide al jugador salir por ellas.
- **Pruebas**: `npm test -- deadzone` (5 ficheros portados de Vitest con `test/vitest-shim.ts` + `deadzone-net`: 1–4
  jugadores, disparos y compras de un invitado, daño, reaparición, fin de partida, invitado y sala; y `deadzone-pursuit`:
  muros finos, partida quieta que acaba con zombis dentro haciendo daño y ruta por la ventana abierta). Capturas:
  `npm run shot -- test/browser/deadzone.mjs` (las tres últimas son ya una ronda de verdad: llegan, entran y cruzan).

## 6k. Dead Zone: gráficos, armas, caja del centro y mejorador (2026-10-21)

Petición del usuario: más aspecto de juego de zombis, mejorar las armas, la **caja misteriosa en el centro del mapa donde se pueda
girar** y un **mejorador de armas como el del mapa Town de Black Ops 2**, «exprimiendo al máximo» Three.js y la web.

- **Excepción a §6e**: Dead Zone ya no sigue la regla de «solo cajas simples»: las armas usan perfiles extruidos, cañones torneados
  y cajas biseladas (`RoundedBoxGeometry`) porque el usuario pidió gráficos al máximo. Los personajes (zombis y soldados) siguen
  siendo de cajas (`blockGeometry`, color por vértice, una malla por miembro).
- **Armas** (`weapons/`): 8 (pistola, revólver, avispa, cortacerco, R-14, ametralladora, francotirador y pulso) con versión
  mejorada de cada una (`UPGRADED`, `weaponDef(id, mejorada)`; nombre propio, ×2–2,6 de daño, más cargador y reserva, color `tint`).
  `WeaponSystem` lleva `upg`, `upgrade`, `detach`/`attach` (el mejorador se queda el arma) y `upgradeMask` (bit por ranura, en
  `wp[8]`). `model.ts` construye los 16 modelos; `view.ts` es la primera persona (corredera que retrocede, fogonazo en cruz, luz).
- **Caja** (`world/centerpiece.ts` + `game/interact.ts`): plataforma con haz de luz en el centro de la plaza (0, −16), 950 puntos. Fases
  0 cerrada → 1 ruleta (`BOX_ROLL` 4,2 s, cambia de arma cada vez más despacio) → 2 oferta (`BOX_OFFER` 9 s; solo la coge quien pagó; si
  no, se pierde). No sale un arma que ya llevas. Estado por red: `bx = [fase, arma, quién, s]`.
- **Energía y mejorador**: interruptor en el depósito norte (gratis, una vez) → `pu = [energía, fase, quién, arma, mejorada, s]`.
  Mejorador en el Bloque B: 2 500 puntos, `UPGRADE_WORK` 3,6 s trabajando (el arma sale de la mano) y `UPGRADE_OFFER` 15 s para coger
  la mejorada (si no, se la devuelve sola). Pintadas en las paredes guían hasta ellos. Los carteles de interacción de cada jugador
  viajan en el snapshot (`pr`) para que el invitado también los vea.
- **Gráficos**: `stage.ts` (cielo con shader: luna de sangre, nubes, estrellas, relámpagos, ciudad en ruinas; luna con sombras que
  sigue al jugador; mapa de entorno PMREM para reflejos; **grupo fijo de 11 luces** que salta a las fuentes más cercanas de las ~35 del
  mapa), `fx/post.ts` (HDR con MSAA + bloom + «look zombi»: aberración, viñeta, sangre en el borde con poca vida, grano),
  `fx/weather.ts` (lluvia 100 % en el vertex shader que no cae bajo techo, ceniza y brasas, bancos de niebla, relámpagos y trueno),
  `fx/particles.ts` y `fx/effects.ts` (sangre con charcos y salpicaduras, impactos con agujero de bala, casquillos con física,
  humo, cabezas reventadas), `world/batch.ts` (fusiona la geometría estática por material y recalcula las UV **en metros del
  mundo**), `world/textures.ts` (512 px con relieve), `world/decals.ts`/`decor.ts` (sangre, manos, arañazos, pintadas, charcos).
- **Calidad adaptativa** (`DzStage.adapt`): mide ms reales por fotograma y baja resolución interna (×3/×2/×1), MSAA y bloom si va
  lento (>25 ms) o sube con margen. En una iGPU Intel UHD el postproceso era el 65 % del coste.
- **Trampa que costó un rato**: una `SpotLight` con `shadow.autoUpdate = false` que nunca generó su mapa invalida el muestreador
  de sombras y **ninguna malla iluminada se dibuja** (solo las `MeshBasicMaterial`). Hay que poner `needsUpdate = true` una vez.
- **Orientación**: los zombis, soldados y armas miran a −Z (como la cámara del jugador); los brazos se levantan con rotación +X.
- **Pruebas**: `test/deadzone-machines.test.ts` (arsenal y mejora, caja, energía, mejorador, invitado y precios) y capturas con
  `npm run shot -- test/browser/deadzone-visual.mjs` (plaza, caja girando, mejorador, las 16 armas, zombis y sangre) y `deadzone-rendimiento.mjs` (ms por fotograma quitando piezas).

## 6i. Billar (claves)

- **Qué es**: bola 8 estilo móvil (8 Ball Pool, con nombre propio «Billar»). Pantalla 320×200, mesa 240×120 vista
  desde arriba con cámara **ortogonal** (`config.ts`: pantalla = centro + mundo × `ZOOM`), así el ratón se convierte a
  mundo con `toWorld` sin proyecciones. Las bolas son esferas con textura generada (excepción razonada a la regla
  de bloques: una bola de billar no se puede hacer con cajas).
- **Archivos**: `table.ts` física a pasos fijos de 1/240 s con velocidad lineal y angular por bola (`wx`, `wy` giro
  adelante/atrás, `wz` lateral): el taco da `v` y `ω = r × J / I` según dónde pega (hasta medio radio, `SPIN_GAIN` lo
  exagera un poco); el paño resbala (`SLIDE_ACC`) hasta que la bola rueda y solo la frena `ROLL_DECEL`/`ROLL_DRAG`, y de
  ahí salen solos seguir, retroceder y "stun"; el choque entre bolas lleva rozamiento (`BALL_FRIC`: arrastre y paso de
  efecto lateral); las bandas devuelven menos energía cuanto más fuerte llega la bola y su roce (`RAIL_FRIC`) convierte
  efecto lateral en desvío; los labios de las troneras son círculos de `JAW_R`; `Table.clone()` sirve a la IA para
  ensayar. `trace` es la línea de tiro (bola fantasma, también la usa el render); `match.ts` reglas y
  árbitro (`resolve`); `bot.ts` IA (bola fantasma + línea libre + ángulo de corte; los 5 mejores candidatos se **ensayan en una copia de
  la mesa** con varias potencias y solo vale uno que entre; error ±0,35°); `input.ts` ratón/teclado (el taco sigue al cursor suavizado; Shift o clic derecho = puntería fina relativa, ×0,15); `render.ts` escena + taco + HUD; `game.ts` adaptadores.
- **Asientos**: 2 o 4 (`kinds`). Equipo = `asiento % 2` (`groups`, `wins` y `left` van por equipo); en dobles
  `nextOf` alterna el compañero que tira (`Match.shooterOf`). 0 anfitrión, 1.. invitados (`remote`), el resto `ai`
  (o `local` sin bots = por turnos en el mismo equipo). Con ≤1 invitado, **P** alterna 1v1 / 2v2 antes del saque;
  con 2 o más invitados es siempre 2v2. En 1v1 los invitados 2 y 3 solo miran. `PoolHost.key("KeyR")` solo actúa con la partida terminada.
- **Reglas**: mesa abierta hasta la primera bola metida sin falta (no cuenta en el saque); falta = blanca embolsada,
  no tocar nada, tocar primero bola ajena (o la 8 antes de tiempo), o ninguna bola a banda tras el contacto
  (saque: 4 bolas a banda o una embolsada) → bola en mano para el rival. La 8 se marca (`aim.call`, auto con
  `bestPocket` si no se elige) y pierde quien la mete antes de tiempo, con falta o en otra tronera. La 8 en el saque
  rehace el triángulo. Pasados 40 s el turno es falta.
- **Red**: el invitado con turno manda `PoolMsg` (ángulo, potencia, efecto, tronera, contadores `f` tiro y `k`
  colocación **por turno** y `u` = número de turno `Match.turnNo`). El anfitrión ignora mensajes de otro turno
  (así un clic perdido no dispara en el turno siguiente). Los invitados suavizan y extrapolan posiciones; la
  blanca en mano la mueve el cursor local y se confirma con `k`.
- **Pruebas**: `npm test -- pool` (física, 25 partidas CPU contra CPU, falta) y `npm run shot -- test/browser/pool.mjs`.

## 6k. Mazo Loco: cartas en el hub (2026-10-21)

Juego de cartas de colores para 2–4 (estilo UNO) con todas las reglas clásicas. Todo en `src/game/cards/`, lienzo
360×270 (3D en primera persona, ver Dibujo).

- **Baraja** (`deck.ts`): 108 cartas. Por color, un 0, dos de cada 1–9 y dos de cada acción (bloqueo, reversa, +2);
  más 4 comodines y 4 comodines +4. Los ids caben en un número (color × 13 + rango, 52 comodín, 53 +4) y viajan así
  por la red, con repeticiones: el mazo es un array de ids.
- **Reglas** (`table.ts`, lógica pura): se juega al color o al rango de la carta de arriba. Bloqueo salta, reversa
  cambia el sentido (con 2 jugadores salta, como manda el reglamento), +2 hace robar dos y saltar, el comodín cambia
  el color y el +4 además hace robar cuatro. Si no puedes jugar, robas una: si liga sigues en tu turno (juegas o pasas),
  si no pasas solo; solo se roba una vez por turno. Al quedarte con una carta se abre la ventana de «UNO» (2,6 s): si no
  la cantas te caen dos de castigo. Gana la ronda quien se queda sin cartas y cobra los puntos de las que sobran a los
  demás (número por su valor, acciones 20, comodines 50); la partida es a 500 y luego se reinicia con **R**. La primera
  carta de cada ronda es siempre un número (las acciones y comodines se van al fondo: sin efectos raros al empezar).
- **Bots**: ocupan los huecos si el ajuste está activo (en local siempre hay al menos un rival). Juegan con una espera de
  0,7–1,25 s, guardan los comodines para cuando no hay otra, castigan con +2/+4/bloqueo si al siguiente le quedan dos
  cartas y cantan UNO siempre. Si un invitado se cae, su silla pasa a bot y la mesa no se queda esperando.
- **Red**: el anfitrión mueve la mesa y arbitra; el invitado manda su acción (jugar con índice y color, robar, pasar o
  cantar UNO) con número creciente y se repite hasta verla en `ak`. **Las manos viajan enteras en el estado** (como en el
  casino): cada uno dibuja la suya y las de los demás como dorsos, pero con devtools se podrían ver; se aceptó por no
  romper el contrato de un solo `snap` por fotograma. Estado `CardsSnap`: `ph tu dr co hd dp tp gl un dw ut on bo ak ms
  to mv wn bt rd` (≈300 caracteres con cuatro manos).
- **Dibujo en 3D, primera persona** (`scene.ts`, `cardtex.ts`, `render.ts`, `layout.ts`; 2026-10-22 se pasó de 2D a Three.js a petición del
  usuario, estilo Liar's Bar): mesa redonda de fieltro bajo una lámpara con sombras; los rivales sentados (izquierda, enfrente,
  derecha, en el sentido del reloj) con su abanico de dorsos en las manos y un cono dorado sobre quien tiene el turno; tú
  solo ves tus manos (mangas, palmas detrás de las cartas y pulgares por delante) sosteniendo el abanico. Las cartas de la
  mano cuelgan de la cámara a 0,62 y se colocan con `handPoses` (centro y giro de cada una); `hitHand` pulsa la carta girada
  de verdad (no su caja), así que lo que se ve y lo que se pulsa coinciden. Caras y dorso son texturas de lienzo 320×448
  (borde crema, óvalo inclinado, símbolos de bloqueo/reversa/+2/+4/comodín, índices en dos esquinas) en geometría de
  esquinas redondeadas, con mipmaps y anisotropía. Animaciones: la carta jugada vuela a la pila (la del rival sale de su
  abanico), la robada sube desde abajo, la que liga se levanta y la señalada sube más; la pila guarda las cinco últimas
  jugadas con giros fijos y un aro del color activo con su luz. Los carteles de los rivales (nombre, cartas, puntos, ¡UNO!)
  se dibujan en 2D sobre sus cabezas proyectadas. Si no hay WebGL queda el dibujo 2D de antes como respaldo.
- **Entrada** (`input.ts`): ratón (clic en carta, botón o color; `attachMouse` una vez) y teclado (← →, Espacio, D, P, U,
  1–4, Esc). Una carta que no liga devuelve la acción 0 y la mesa avisa «ESA CARTA NO LIGA» en vez de no hacer nada.
- **Pruebas**: `npm test -- cards` (`cards-rules`: baraja, jugadas legales, efectos, robo, UNO, puntos, partida completa
  de bots sin perder cartas y geometría de la mesa en el lienzo; `cards-net`: jugada de un invitado con acuse, mensajes
  repetidos, fuera de turno, comodín con color, estado < 400 caracteres, desconexión a bot, reversa y reinicio). Capturas
  y partida real: `npm run shot -- test/browser/cards.mjs` (juega una carta con el ratón, elige color y roba de verdad).

## 6e. Estilo 3D: bloques simples (regla del usuario)

**Todo lo 3D se modela con cajas grandes y simples**, como figuras de bloques: una caja para el torso, otra para
la cabeza, cajitas encima para cuencas, ojos, nariz, boca y dientes. Nada más complicado:

- **No** esferas, cilindros redondos, curvas, perfiles extruidos ni geometría deformada. Se probó (cabeza de
  esfera deformada, cañones de tubo) y al usuario no le convenció. **Única excepción**: las bolas de Sumo,
  que son icosaedros de pocas caras con sombreado plano ("bolas facetadas", elegido por el usuario).
- **No** cuadrícula de vóxeles finos (miles de cubitos de 1 cm, estilo MagicaVoxel). También se probó y no era
  lo que quería: "cubos y así", no vóxeles como tal.
- Sí vale: `BoxGeometry` (función `box` de `models.ts`), cajas giradas o estiradas entre dos puntos (`beam`,
  `stretch`) y, como mucho, un prisma de 4 lados (la pantalla de la lámpara). La mesa es cuadrada por eso.
- Sí valen los extras de Three.js que no son geometría: texturas dibujadas en canvas sobre las caras
  (`textures.ts`), luces y sombras, halos (sprites), transparencias. El humo y el polvo también son cubitos.
- Pocas piezas por modelo: los detalles se resuelven con color, textura o una cajita plana pegada a la cara.
- Una figura reconocible pesa más que el detalle: el crupier se reconoce por la cara pálida y huesuda, las
  cuencas negras con ojos que brillan y los dientes; se escala ×`DEALER_SCALE` para que imponga.

### Cómo modificar los modelos (`models.ts`)

- `box(tamaño, material, centro, giro?)`: tamaño y centro en metros; giro `[cabeceo, guiñada, alabeo]`.
  Referencias: tablero en y = 0, mesa de 2 × 2 m, suelo en `FLOOR_Y` (−0,75), asientos a `SEAT_R` (1,45 m).
- **Personajes** (`buildDealer`, `buildHuman`): en coordenadas del asiento, mirando hacia −z. Lo de cintura para
  arriba va en `body` (se inclina en `PIVOT`); piernas y silla en `legs` (quedan bajo la mesa). Usar siempre los
  materiales de `palette()` (`p.std`, `p.glow`) para que `dim` pueda oscurecerlos cuando el jugador queda fuera.
  Si cambia la altura de la cabeza o los hombros, actualizar `head`/`shoulders`/`eyes` del objeto que se
  devuelve: el render apunta la escopeta a `head`, cuelga los brazos de `shoulders` y pone halos en `eyes`.
- **Escopeta** (`buildGun`): origen en el cajón, cañón hacia −z. `GUN_GRIP` y `GUN_PUMP` son donde se ponen
  las manos; `gunMuzzle` es la boca (fogonazo y humo). Hay dos cañones (`full`/`sawed`) que se alternan.
- **Objetos** (`buildItem`): apoyados en y = 0, de 5–10 cm. Para añadir uno: su caso en `buildItem`, su `I_...` e
  info en `config.ts` (`ITEMS`), su efecto en `match.ts` (`applyItem`, y `canUse` si tiene condiciones), su
  frase en `eventText` (`render.ts`) y, si quieres que el crupier lo use, una regla en `bot.ts`.
- **Cartuchos** (`buildShell`): rojo oscuro = real, azul claro = fogueo (contrastan también en gris).
- **Sala, mesa y lámpara**: `buildRoom`, `buildTable`, `buildLamp`. La luz no está ahí sino en `Stage`
  (`render.ts`): foco de la lámpara (`SpotLight`, con sombras), bombilla (`PointLight`, ilumina las caras),
  hemisférica, luz junto a la cámara y destello. Si algo queda muy oscuro, subir la bombilla o
  `toneMappingExposure` antes que añadir luces.
- **Texturas** (`textures.ts`): se dibujan con Canvas 2D la primera vez (`make`). Para una etiqueta nueva basta
  con `label(clave, fondo, franja, tinta, palabra)`. Poner la textura en la cara que toca pasando un array de
  6 materiales a `box` (orden de caras: +x, −x, +y, −y, +z, −z).
- **Posiciones en la mesa** (`render.ts`): `slotLocal` coloca los 8 huecos de objetos de cada jugador; las
  manos en reposo, la escopeta en reposo (`GUN_REST`) y la animación del disparo están en `Stage.update`.

### Cómo comprobar un cambio visual

1. `npm run typecheck`.
2. Capturas de escenas fijas (sección 8, con las recetas): una página que importa `RuletaRenderer` y dibuja estados inventados
   (mi turno, me apuntan, disparo, 4 jugadores, intro de ronda...), capturada con Edge sin ventana y SwiftShader.
   Revisar la imagen y corregir (así se ajustaron los brazos, la luz de la cara del crupier y el tamaño de las
   marcas de selección).
3. Simulación de anfitrión + invitado con teclados al azar para confirmar que no se rompe nada de la lógica.

## 6f. Interfaz de recreativa (petición del usuario, 2026-10-18)

Los HUD y el menú tienen aire de recreativa retro. Piezas, todas compartidas:

- **Fuente de píxeles propia** (`core/pixelfont.ts`): glifos 5×7 dibujados a mano, solo mayúsculas (las
  minúsculas se pintan en mayúscula), con tildes/eñe/diéresis en dos filas encima y los símbolos que usan los
  juegos (★ ▼ ← → ↑ ↓ ↔ º · … « » ×). Un punto mide `tamaño/9` y se redondea a píxeles de pantalla (nítido); por
  debajo de 1,5 px de pantalla no se redondea para no cambiar el tamaño. Carácter desconocido = cuadro hueco:
  si un texto nuevo usa un símbolo raro, añadirlo a `GLYPHS`.
- **`text()` de `core/draw.ts` ya dibuja con esa fuente**: de la cadena `font` solo cuenta el tamaño en px
  (`"bold 8px Arial"` y `"8px"` dan lo mismo). **No usar `ctx.fillText`/`measureText`** en los HUD: usar `text`,
  `textWidth` y `fitText` (recorta con "…"). Las texturas 3D (`ruleta/textures.ts`, la caja "?" de Karts) siguen
  con `fillText` a propósito.
- Adornos en `core/draw.ts`: `shadowText` (sombra dura de un punto), `titleText` (rótulo grueso con relieve,
  sombra y brillo arriba; para cuentas atrás, carteles y títulos; mide con `titleWidth`/`fitTitle`), `panel`
  (caja de esquinas recortadas, borde de color, sombra dura; `u` = grosor, 2 en Bomberman), `badge` (chapa
  cuadrada con el número del jugador; sustituye a los círculos con número) y `segmentBar` (barra por segmentos
  para vida o carga).
- **Efecto CRT** (`core/crt.ts`): líneas de barrido (solo con `pixelScale ≥ 2,5`) y bordes oscurecidos, encima
  del juego en `main.ts`. Ajuste `arcade.crt` (por defecto sí) y botón "Efecto CRT" del menú; en la web va a
  localStorage `arcade.crt`. Mensaje de la webview: `setCrt`.
- **Menú** (`ui/menu.ts`): monoespaciada en mayúsculas, esquinas rectas, sombras duras, neón (rosa `#ff3d8b`,
  cian `#3df2ff`), código y nombre en verde fósforo, color de acento por juego en el selector. La CSP de la
  webview no deja cargar fuentes: el logo "ARCADE" se dibuja con `titleText` en un canvas y va como `<img>` (data URL).
- **Diseño único (2026-10-21)**: todos los juegos y el menú usan la paleta del casino (`core/theme.ts`: ciruela, filo naranja, dorado). Los HUD abren con `hudStrip` (franja ciruela + filo naranja) y los paneles toman `C_BG`/`C_LINE` por defecto. Colores nuevos: sacarlos de `theme.ts`, no inventarlos.
- **Personajes únicos (2026-10-21)**: todos los jugadores son el «poroto» del casino (`core/bean.ts`: cápsula de color, ojos saltones, guantes, piececitos, bombín; `buildBean(color, mat, croupier)`). Lo usan Sumo (sobre la bola), Karts (al volante), Ruleta (jugadores y crupier = botones amarillo con fez), Bloques; Bomberman y Monigotes lo dibujan en 2D con el mismo diseño. Esto sustituye a la regla de «sin esferas» (6e) solo para los personajes. El casino aún tiene su propia copia en `scene.ts` (`character`).
- Convenciones: paneles de resultados con borde rosa; el pie ("R: otra ronda...") alterna de tono como un "PULSA
  START"; el panel de quien tiene el turno (Ruleta) parpadea en amarillo; marcas de minimapa cuadradas.

## 7. Trampas conocidas (ya nos pasaron)

- **PowerShell 5.1 + tildes**: `Get-Content`/`Set-Content` sin codificación rompen UTF-8 (`pestaÃ±a`).
  Editar con el editor o con Node (`fs` en utf8); nunca reescribir fuentes con cmdlets de PowerShell.
- **`onkeydown = () => cond && f()`** devuelve `false` y cancela la tecla: usar `addEventListener` sin devolver nada.
- **Vercel + ESM**: `package.json` tiene `"type": "module"`; las importaciones relativas en `api/` llevan
  `.js` (`../src/server/signal.js`). La extensión se compila a `dist/extension.cjs` por eso.
- **Vercel no mantiene WebSockets**: el relé es HTTP con Redis; no intentar sockets en funciones.
- `tsc` debe ejecutarse desde la raíz del proyecto (`npm run typecheck`) y tras `npm install`; si no
  hay `node_modules`, `npx tsc` instala un paquete `tsc` equivocado.
- npm reciente avisa de que el `postinstall` de esbuild no está en `allowScripts`: se puede ignorar,
  esbuild funciona igual con su binario de plataforma.
- El README se quedó desfasado una vez (solo hablaba de Bomberman y Karts, decía 5 vueltas y un comando
  que ya no existía). Al cambiar juegos, controles, ajustes o comandos, actualizar también el README.
- Teclado en `Keyboard` ignora eventos cuando se escribe en inputs (`isTyping`).
- Si hace falta un reemplazo masivo desde PowerShell, usar .NET con UTF-8 sin BOM
  (`[IO.File]::ReadAllText(f, [Text.Encoding]::UTF8)` / `WriteAllText(f, t, (New-Object Text.UTF8Encoding $false))`).
- **WebGL**: los navegadores limitan los contextos activos; por eso hay **un solo** `WebGLRenderer` en
  `core/three.ts` para todos los juegos 3D. No crear otro. Al cambiar de circuito (Karts) la escena vieja se
  libera con `disposeScene` (si no, se acumulan geometrías y texturas de 1536² en la GPU).
- Los juegos 3D no crean nada de WebGL ni tocan el DOM al importarse ni en el constructor (todo se construye en
  el primer `draw`): así las simulaciones en Node pueden importar `game.ts` sin navegador.
- Edge sin ventana escribe la captura al cerrar: lanzarlo con `Start-Process -Wait` (si no, el PNG aún no existe
  al leerlo). Para simulaciones largas dentro de la página, subir `--virtual-time-budget` (p. ej. 300000).
- esbuild desde la carpeta temporal: las importaciones relativas largas fallan; usar rutas absolutas
  (`import ... from "C:/Users/.../ArcadeCode/src/game/..."`).
- **Rejilla de rutas muestreando solo el centro de la celda**: en Dead Zone los muros miden 0,35 m y las celdas
  0,5 m, así que un muro cabía entero entre dos centros, la rejilla no lo veía y las rutas de los zombis lo
  atravesaban: se quedaban empujando la pared por fuera y **no llegaban nunca al jugador** («no salen los zombis»).
  Al rasterizar hay que cerrar toda celda que solape el AABB engordado con el radio del cuerpo (`NavGrid.BODY`),
  no solo la del centro. Los tests de la rejilla no lo cazaban porque su muro de prueba caía justo encima de un
  centro de celda. Regresión en `test/deadzone-pursuit.test.ts`.
- **Puertas y ventanas de un juego: colisión y navegación son dos cosas distintas**. Los tablones de Dead Zone
  eran solo malla + bloqueo de la rejilla, sin colisión: al abrir la ventana al zombi (que trepa el alféizar,
  ignorando el colisionador `window`) había que añadir el colisionador `barricade` para que una ventana cerrada
  siguiera frenándolos (y tapando balas y visión). Al revés: si algo debe frenar al jugador pero no al enemigo,
  no basta con un colisionador, hacen falta etiquetas distintas. 

## 8. Cómo se ha probado (reutilizable)

**Lo primero, las herramientas del repo** (petición del usuario, 2026-10-19: las pruebas tardaban mucho):

- **`npm test`** (o `npm test -- drops red`, filtra por nombre): `test/run.mjs` empaqueta cada `test/*.test.ts` con
  esbuild (inyecta el DOM falso de `test/stubs.js`, que también hace de `performance.now` controlable) y los corre
  en paralelo; todo tarda ~3 s. Utilidades en `test/lib.ts`: `check(ok, texto, detalle)`, `rng(semilla)`,
  `tickClock(ms)` y `blocksInput()` (entrada falsa de Bloques con contadores `_dig`, `_place`, `_inv`, `_throw`,
  `_clicks`...). Banco de red de Bloques reutilizable en `test/blocks-net.ts`. `games.test.ts` cubre Sumo,
  Monigotes, bots, cambio de juego en red y la malla. **Al añadir algo, añadir su prueba aquí** en vez de scripts sueltos.
- **`npm run shot -- test/browser/<escenario>.mjs [carpeta]`** (salida por defecto `.cache/shots/`): `scripts/shot.mjs`
  levanta `serve.mjs` en el 8123, abre Edge sin ventana con **la GPU real** (`--use-angle=d3d11`; si no hay, cae
  a SwiftShader) en `/?test&seed=777` y ejecuta el escenario, que recibe `{ js, start, step, draw, hold, press,
  mouse, shot, sleep }`. Un escenario de 5 capturas tarda ~3,5 s.
- **Modo `?test` de `main.ts`**: el bucle no corre solo; `window.__arcade` tiene `start(id)`, `step(n, dt)`
  (pasos fijos, instantáneo), `draw(n)` (Bloques construye unos chunks por dibujo: `draw(20)` al empezar),
  `key(code, down)` y `game` (el objeto del juego, p. ej. `BlocksHost`, para preparar estado: `game.pilot.pitch`).
  `?seed=N` fija también el mundo de Bloques en local.
- Lo visual que solo es "cómo se ve" lo puede mirar el usuario con F5: pedírselo antes que hacer capturas largas.
- El `.vsix` solo cuando el usuario lo pida; mientras se trabaja basta `npm run typecheck` + `npm test`.

Recetas antiguas (antes de lo anterior; siguen valiendo para cosas que no cubren):

- Lógica en Node: empaquetar con esbuild (`--platform=node`) y simular (carreras solo IA, 400
  circuitos, mapas de Bomberman, física de derrape).
- Render y red en Edge sin ventana controlado por CDP (`--remote-debugging-port`): capturas, tecleo,
  y prueba de extremo a extremo con anfitrión + invitado directo + invitado "bloqueado" (se quitan las
  líneas `a=candidate` del SDP para forzar el relé) contra `npm run serve`.
- Capturas de escenas fijas: una página que importa el render y dibuja estados inventados, capturada con
  `msedge --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --virtual-time-budget=8000
  --screenshot=...` (sin los flags de SwiftShader no hay WebGL sin ventana).
- Antes de entregar: `npm run typecheck`, `npm run build`, `npm run build:web` y reempaquetar el `.vsix`.

### Recetas de las pruebas de los juegos 3D (de antes de `test/`: al rehacer una, pasarla a `test/`)

Todos van en la carpeta temporal, se empaquetan con `npx esbuild x.ts --bundle` (`--platform=node --format=esm`
para Node, `--format=iife` para la página) e importan el código del juego con rutas absolutas. La página es un
HTML con `<div id="grid">` y el `.js`; cada escena se dibuja en un lienzo de `tamaño lógico × 2` con
`ctx.setTransform(2, 0, 0, 2, 0, 0)` y `draw(ctx, 2)`, y se copia a un `<canvas>` del grid con un título.

- **Ruleta, escenas fijas**: crear `RuletaSnap` a mano (fase, turno, `ev`/`et` del disparo u objeto, objetos,
  vidas, `dl` del crupier) y llamar 3 veces a `renderer.update(10); renderer.draw(...)` para que la cámara llegue
  a su sitio. Escenas útiles: mi turno con la escopeta o un objeto seleccionado, el crupier me apunta
  (`ev=[n,1,1,0,-1,1,0]`, `et≈0.9`), disparo real contra mí (`ev[4]=1`, `et≈1.09`), me apunto a mí mismo, apunto
  al crupier, eligiendo objetivo, 4 jugadores enseñando la carga, uno fuera, intro de ronda, usando la lupa.
- **Ruleta, lógica**: `new Match(["ai","ai",...])` y `update(1/30)` hasta `PH_OVER` (300 partidas por tamaño),
  comprobando vidas en rango, que ninguna se atasca y que se usan los 9 objetos (la adrenalina se cuenta con
  `ev[6] === 1`).
- **Red de cualquier juego**: anfitrión (`XHost` con 1 remoto) + invitado (`XGuest(1, ...)`) con teclados falsos
  que pulsan al azar (`{ anyDown(codes) }`); cada frame `guest.onSnap(JSON.parse(JSON.stringify(host.frame().snap)))`
  y `host.onMessage(1, JSON(guest.outgoing(...)))` (por relé, 1 de cada 3 frames), comprobando que la partida
  termina y que ningún mensaje pasa de 300 caracteres. En Node hay que sustituir `performance.now` por un reloj
  propio que avance con la simulación.
- **Sumo**: `new BallsHost(idle, 0, "local", true)` con una entrada quieta (`{ poll(){}, dx: 0, dy: 0,
  takeDash: () => false }`); simular y dibujar solo los últimos segundos antes de cada captura (el render
  necesita frames seguidos para que caigan las baldosas). Momentos: cuenta atrás, mitad de ronda, 44 s
  (plataforma encogida) y una bola en `state === 1` (cayendo).
- **Karts**: piloto automático como `DriveSource` que apunta al punto `seg + 9` de la línea central
  (`steer = clamp(diferencia de ángulo × 3)`, `throttle = 1`, `drift` opcional en las curvas). Para elegir tema,
  buscar una semilla con `generateTrack(seed).theme.name` y poner `host.race = new Race(seed, ["local"], pilot,
  true)`. Capturas: salida, 9 s y derrapando a los 15 s, en Pradera, Desierto y Nieve.
- **Relieve de Karts**: `terrainOf` en 50 circuitos midiendo tiempo, pendiente a lo largo de la pista
  (`heightAt` cada 3 puntos) y lateral (bordes del asfalto).
- **HUD de todos los juegos** (para cambios de interfaz): una página con `?g=karts|balls|stick|ruleta|bomber|menu|
  picker` que crea el juego real (`XHost(new XInput(kb), 0, "local", true)` con un `Keyboard` sobre un
  `EventTarget` vacío, o `new Game(PLAYER_CONTROLS.map(...LocalController), 2, semilla, "local")`), avanza
  `update(1/30)` y dibuja con `draw(ctx, 3)` + `drawCrt(ctx, 3)` en varios momentos (cuenta atrás, ¡YA!, en
  partida, resultados; en Bomberman `handleKey("KeyP")` para la pausa). El menú: `new Menu().showMain(...)` o
  `showPicker(...)`. Ventana de Edge de 2340 de ancho para 3 capturas a ×3; el menú, a 520 (Edge sin ventana no
  baja de ~500 de ancho).
- **Derrape**: integrar solo `a` y `ma` con las fórmulas de `stepKart` a `MAX_SPEED` durante 1,5 s, para volante
  cerrando, neutro y abriendo; anotar el cruce máximo y el radio (`v / giro`).

## 9. Estado y pendientes (actualizado el 2026-10-17)

Hecho en las últimas sesiones (todavía **sin commit** y **sin desplegar** en Vercel; el `.vsix` 0.1.3 ya se reempaquetó con todo esto el 2026-10-17):

- MEMORIA.md y README revisados y al día (el README estaba desfasado).
- Juego nuevo **Ruleta de cartuchos** (secciones 6d y 6e): reglas, 9 objetos, crupier, red, 3D de bloques.
- El 3D pasó por tres versiones a petición del usuario: motor propio por software (le pareció "primitivo"),
  Three.js con esferas y curvas (no le convencieron las esferas), vóxeles finos (tampoco) y por fin **cajas
  simples**, que es lo que quiere (regla 6e).
- **Sumo de bolas** pasado de modo 7 a 3D (bolas facetadas, baldosas que caen sin temblar, lava de cubos).
- **Karts** pasado de modo 7 a 3D con **relieve**, y derrape corregido (sección 6).
- `three` añadido en `devDependencies`; `core/three.ts` compartido por los tres juegos 3D.

Pendiente o por decidir:

- Probarlo jugando de verdad (teclado, barra lateral de VS Code, red con dos equipos): hasta ahora se ha
  comprobado con simulaciones y capturas en Edge sin ventana (SwiftShader), no en una gráfica real.
- Rendimiento en equipos flojos: la lava de Sumo mueve ~2.500 cubos por frame y hay sombras en los tres juegos.
  Si va lento: menos celdas de lava (`LAVA_CELL` más grande), sombras de 512 o `MAX_RES` 2 en `core/three.ts`.
- Karts: las cuestas son solo visuales; si se quiere que frenen o aceleren hay que tocar `stepKart` (lo usan
  anfitrión e invitado) y probar bien en red.
- Ruleta: al apuntarte a ti mismo, tu mano queda grande delante de la cámara.
- Ajustar el derrape a gusto del usuario cuando lo pruebe (constantes `DRIFT_*` en `karts/config.ts`).
- Monigotes y Bomberman siguen en 2D; si se pasan a 3D, seguir la regla de bloques (6e) y usar `core/three.ts`.
- Bloques: probar el rendimiento con gráfica real. La supervivencia básica ya está (romper, recoger, inventario,
  crafteo, objetos en el suelo, animales que se pueden matar, vida, hambre y daño, cuevas, menas, horno y
  antorchas con luz, monstruos, día y noche); siguiente, lo que el usuario
  pida: durabilidad, armadura, cama (saltar la noche), arco para el jugador (flechas e hilo ya existen), oro y más
  menas, lava, cofres y hornos compartidos (necesitarían viajar por la red), guardar el mundo.
