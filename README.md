# Arcade: Bomberman, Karts, Sumo de bolas, Monigotes, Ruleta de cartuchos, Bloques, Casino de deudas y Billar

Hub de juegos multijugador en TypeScript + Canvas. Se juega en el navegador o dentro de VS Code
(vista "Arcade" del Explorador). Quien crea la sala elige el juego y, al acabar la ronda, puede
cambiar a otro sin cerrar la sala (tecla **J**).

- **Bomberman**: mapas procedurales, cajas con 3 buffs (velocidad, rango, bombas) y enemigos.
  Local 1–2 jugadores en un teclado o en red hasta 4.
- **Karts**: carreras en 3D de bloques con relieve (cuestas, colinas, montañas al fondo),
  circuitos procedurales, 3 vueltas, derrape con miniturbo y objetos (turbo, plátano, proyectil).
  En red cada jugador conduce su kart en su pantalla (sin retraso) y el anfitrión arbitra objetos,
  golpes y posiciones.
- **Sumo de bolas**: empuja a los rivales fuera de una plataforma circular sobre lava, que encoge a
  partir de los 20 s. Gana el último en pie (ronda de 60 s); las victorias se acumulan entre rondas.
- **Monigotes**: peleas de monigotes en plataformas (3 escenarios). Armas en cajas: espada, pistola
  y bomba. Cuanta menos vida, más lejos sales despedido. Gana el último en pie (ronda de 90 s).
- **Ruleta de cartuchos**: en 3D de bloques y en primera persona, sentado a una mesa bajo una lámpara
  frente a un crupier. Por turnos, con una escopeta cargada con cartuchos reales y de fogueo en orden
  desconocido (al empezar cada carga solo se sabe cuántos hay de cada). Dispárate a ti mismo con uno
  de fogueo y repites turno. 3 rondas (2, 4 y 5 vidas) y 9 objetos: lupa, cigarrillos, cerveza,
  sierra, esposas, teléfono, inversor, medicina caducada y adrenalina. En la última ronda, con
  2 vidas o menos, no hay curas.
- **Bloques**: mundo de bloques en primera persona para construir juntos (modo creativo, base para
  crecer). Mundo de 96 × 48 × 96 generado por semilla (colinas, ríos, playas, árboles, cuevas con menas de
  carbón, hierro y diamante); romper y poner 9 tipos de bloque (antorchas incluidas) y volar. Bajo tierra
  está oscuro: la luz del cielo no llega y las antorchas alumbran. Hay **día y noche** (un día entero son 10
  minutos): atardece, salen la luna y las estrellas y de noche todo se oscurece. En red el mundo es el del anfitrión y todos ven los cambios de todos.
  No tiene final: J cambia de juego en cualquier momento.
- **Bloques: supervivencia**: el mismo mundo, pero romper lleva tiempo (más rápido con la herramienta
  adecuada), lo roto va al inventario y poner gasta. Inventario de 36 ranuras con crafteo 2×2 y mesa de
  trabajo 3×3, con el ratón como en Minecraft: tablones, palos, mesa, horno, antorchas y pico/hacha/pala/espada
  de madera, piedra, hierro y diamante. La piedra y el carbón piden pico; el hierro, pico de piedra; el
  diamante, pico de hierro (sin él se rompen pero no sueltan nada). El **horno** funde la mena de hierro en
  lingotes, cocina la carne y hace cristal, piedra y carbón vegetal; arde con carbón o madera y sigue
  funcionando con la pantalla cerrada (cada horno guarda lo de cada jugador). Lo roto cae al suelo y se recoge al acercarse; Q
  tira objetos. Cada jugador lleva su propio inventario. Por la hierba pasean vacas, cerdos, ovejas y
  gallinas: con un clic se les golpea (más fuerte con espada o hacha), huyen y al morir sueltan carne cruda,
  cuero, lana o plumas. Si quedan pocos, aparecen manadas nuevas lejos de los jugadores. Donde hay poca luz (de
  noche al aire libre y siempre en las cuevas) aparecen **monstruos**: zombis y arañas que pegan, esqueletos que
  disparan flechas y petardos que se encienden y explotan rompiendo bloques. Zombis y esqueletos arden al sol;
  las antorchas evitan que aparezcan cerca. Hay **vida** (10
  corazones) y **hambre** (10 muslos): caer más de 3 bloques hace daño, bajo el agua se acaba el aire, el hambre
  baja con el tiempo y al moverse, y con el hambre a 0 se pierde vida (hasta medio corazón). Con el hambre casi
  llena se cura sola; la carne se come manteniendo el clic derecho (cocinada alimenta mucho más). Al morir se suelta todo donde se cae y se
  reaparece en el punto de salida.
- **Casino de deudas**: cooperativo de 1 a 4 en cinco rondas de dificultad progresiva (la 5 prepara al jefe final, aún
  por llegar). Todos empiezan con 100 monedas; en la **ventanilla** (vestíbulo) se depositan monedas dentro del tope de
  la ronda y esas monedas son las que se apuestan en las mesas. Hay que cumplir el objetivo del equipo antes de que
  acabe cada ronda, esquivar a los guardias (la cárcel quita el 50 % de la cartera), apartar a los borrachos que
  bloquean las mesas y coordinarse con la palanca, el timbre y la alarma. Todo el balance está en `balance.ts`.

- **Dead Zone: Outbreak**: FPS cooperativo de 1 a 4 en el SECTOR 09, una ciudad en ruinas de noche bajo una luna de sangre,
  con lluvia, niebla, relámpagos y sombras. Rondas infinitas de infectados (caminantes, corredores y brutos, con seis
  aspectos cada uno), puntos por impacto y baja, compras de pared, puertas que se abren con puntos y barricadas que hay que
  reparar. Ocho armas (pistola, revólver, avispa, cortacerco, fusil, ametralladora, francotirador y cañón de pulso).
  En el **centro de la plaza** está la **caja misteriosa** (950 puntos): se abre, la ruleta gira entre las armas y te
  ofrece una que puedes coger unos segundos. Al fondo, en el depósito norte, el **interruptor de la energía**; con ella, el
  **mejorador** del Bloque B (2 500 puntos) se queda tu arma unos segundos y la devuelve mejorada (más daño, cargador y
  reserva, otro nombre y brillo propio). Cada jugador lleva sus propios puntos y armas; si caes, vuelves al acabar la
  ronda; si caen todos, fin de la partida.

- **Billar (bola 8)**: lisas contra rayadas en una mesa vista desde arriba (3D). Saque con triángulo,
  grupos que se fijan al meter la primera bola, **efecto** (rosca arriba/abajo y lateral), línea de
  tiro con bola fantasma, **bola en mano** tras una falta (blanca embolsada, sin tocar bola, bola
  equivocada o ninguna a banda), reloj de 40 s por turno y 8 en la tronera marcada para ganar.
  1 contra 1 (CPU, por turnos en el mismo equipo sin bots, o en red) o **2 contra 2** hasta con 4 personas: los
  asientos pares contra los impares y los compañeros se turnan para tirar. Con 3 o 4 personas es siempre 2 contra 2;
  con menos, **P** alterna 1 contra 1 / 2 contra 2 antes del saque (los huecos los ocupa la CPU).

En Karts, Sumo y Monigotes los huecos libres hasta 4 los ocupan **bots** (se pueden desactivar desde
el menú; sin bots, en solitario es contrarreloj o aguantar). En Ruleta de cartuchos los bots sientan
al **crupier** (en solitario está siempre). En red vale el ajuste del anfitrión.

Escala de grises: botón del menú o tecla **G** (en gris, cada jugador lleva su número encima).
El nombre del jugador (máx. 12 caracteres) se elige en el menú.

## Controles

En todos los juegos valen **WASD o flechas** y **Espacio o Enter** como botón de acción
(en red cada jugador puede usar cualquiera de los dos).

| Juego | Moverse | Acción | Otras |
|---|---|---|---|
| Bomberman | WASD / flechas | Bomba: Espacio / Enter | R nuevo mapa · T repetir mapa · P pausa · 1/2 jugadores (solo local) |
| Karts | ↑ acelerar · ↓ frenar · ← → girar | Objeto: Espacio / Enter / E | Derrape: Shift / C / K · R nueva carrera |
| Sumo de bolas | WASD / flechas | Embestida: Espacio / Enter / Shift / E | R nueva ronda |
| Monigotes | ← → mover · ↑ saltar (doble) · ↓ bajar de plataforma | Golpe/arma: Espacio / Enter / E / K | R nueva ronda |
| Ruleta de cartuchos | ← → elegir escopeta/objeto y objetivo | Usar/disparar: Espacio / Enter / E | ↓ / Retroceso volver · R nueva partida |
| Bloques (creativo) | WASD andar · Espacio saltar/subir · Shift bajar (volando) · ratón (clic para capturarlo) o flechas mirar | Romper: clic / Q · Poner: clic derecho / Enter | 1–9 o rueda: bloque · F volar |
| Casino de deudas | WASD andar · ratón mirar · Shift correr | E: sentarse / ventanilla / palanca / timbre / botones / apartar borracho · clic: usar la mano · ↑↓←→ + Enter: apostar o depositar | R nueva partida |
| Dead Zone | WASD andar · ratón mirar · Shift correr · Espacio saltar · Ctrl/C agacharse | Clic disparar · clic derecho apuntar · E comprar/abrir/caja/mejorador/energía y reparar (mantener) · R recargar · 1–3 armas · F linterna | M sonido · R nueva partida (anfitrión, al caer todos) |
| Billar | Ratón: el taco apunta al cursor, con **puntería fina** manteniendo Shift o el clic derecho · A/D o ← → girar (un toque mueve poco, sostener acelera; Shift: fino) | Potencia: arrastra la barra de la izquierda hacia abajo y suelta, o W/S y Espacio tira · Efecto: clic en la bola de abajo (clic derecho / X: centro) | Rueda: potencia · clic en una tronera o Q/E: marcar la de la 8 · R otra partida |
| Bloques (supervivencia) | Igual, sin volar | Golpear a un animal: clic · Romper: mantener clic · Poner o usar la mesa o el horno: clic derecho / Enter · Comer: mantener clic derecho con comida · Reaparecer: Espacio / clic | E / Tab / I inventario (clic coger/dejar, clic derecho la mitad o uno, Mayús+clic mover, clic fuera tirar) · Q tirar uno (Ctrl+Q el montón) · Esc cerrar |

Comunes: **G** escala de grises · **J** cambiar de juego (con la ronda terminada) · **Esc** volver al
menú. En local, Bomberman usa WASD + Espacio para J1 y flechas + Enter para J2. En red, las teclas de
partida (R, T, P, J) son solo del anfitrión.

## Cómo funciona el modo en red

- **Anfitrión**: crea la sala, ejecuta la simulación y envía el estado.
- **Invitados**: envían su entrada y dibujan el estado que reciben.
- Cada invitado intenta primero **conexión directa (WebRTC)**. Si en 7 s no conecta (redes
  corporativas que bloquean el tráfico entre equipos), pasa solo al **relé por Vercel**: estado y
  entradas viajan por HTTPS a `/api/signal`, 10 veces/s, guardados unos segundos en Upstash Redis.
  En una misma partida puede haber invitados directos y por relé. Abajo a la derecha se ve cuál se usa.
- `/api/signal` también empareja (código de sala de 4 letras). El anfitrión recibe una clave
  secreta al crear la sala: sin ella nadie puede leer ofertas ni publicar estado en su sala.
  En local guarda en memoria; en Vercel usa Upstash Redis.

### Coste del relé

Cada participante por relé hace ~10 peticiones/s (anfitrión incluido si tiene algún invitado por
relé): con 4 jugadores, del orden de 100.000–150.000 invocaciones de función y operaciones de Redis
por hora de juego. Revisa los límites de tu plan de Vercel y de Upstash. El plan Hobby de Vercel es
solo para uso no comercial. Ajustable en `src/game/net/relay.ts` (`RELAY_HZ`).

## Jugar en tu red sin Vercel

```
npm install
npm run serve            # puerto 8000; otro: npm run serve -- 3000
```

La consola muestra la URL de tu red (p. ej. `http://10.10.103.18:8000`). Cada jugador la abre en su
navegador. Uno pulsa **Crear sala**; los demás escriben el código y pulsan **Unirse**.

Si los equipos no conectan, revisa que el firewall de Windows permita Node en redes privadas.

## Desplegar en Vercel

1. Crea una cuenta en <https://vercel.com> (puedes entrar con GitHub).
2. Sube esta carpeta a un repositorio de GitHub e impórtalo en Vercel (**Add New → Project**).
   Alternativa sin GitHub: `npx vercel --prod` desde esta carpeta.
   La configuración ya está en `vercel.json`; no hay que tocar nada en el asistente.
3. En el proyecto de Vercel: **Storage → Create Database → Upstash (Redis)** y conéctala al proyecto.
   Esto añade `KV_REST_API_URL` y `KV_REST_API_TOKEN`, que la API detecta sola.
   Sin base de datos el emparejamiento no es fiable (cada petición puede ir a otra instancia).
4. Vuelve a desplegar (**Deployments → Redeploy**) para que tome las variables.
5. Abre `https://TU-PROYECTO.vercel.app`.

La función está fijada a la región `sfo1` en `vercel.json` para estar junto a Redis (us-west-1):
si tu Redis está en otra región, cambia `regions`.

## Extensión de VS Code

- Desarrollo: `npm install`, `npm run build`, abre esta carpeta en VS Code y pulsa **F5**. En la
  ventana nueva aparece la vista **Arcade** en el Explorador; el botón de su barra (o el comando
  **Arcade: Abrir en pestaña grande**) abre el juego en una pestaña del editor.
- Empaquetar e instalar:

  ```
  npm run build
  npx @vscode/vsce package --allow-missing-repository --skip-license --baseContentUrl https://github.com/Kairbros/ArcadeCode/blob/main --baseImagesUrl https://github.com/Kairbros/ArcadeCode/raw/main --out arcade.vsix
  code --install-extension arcade.vsix --force    # luego "Developer: Reload Window"
  ```

- Ajustes (`Arcade` en la configuración de VS Code):

  | Ajuste | Para qué |
  |---|---|
  | `arcade.serverUrl` | URL de emparejamiento: tu despliegue de Vercel o `http://IP-DEL-EQUIPO:8000`. Por defecto, el despliegue público del proyecto. |
  | `arcade.grayscale` | Escala de grises (también con G o desde el menú). |
  | `arcade.bots` | Rellenar con bots en Karts, Sumo y Monigotes; crupier en Ruleta de cartuchos; rival en Billar (sin bots, dos jugadores por turnos). |
  | `arcade.crt` | Efecto de pantalla de recreativa: líneas de barrido y bordes oscuros (también desde el menú). |
  | `arcade.playerName` | Tu nombre en las partidas (vacío: «Jugador N»). |

## Estructura

```
src/game/main.ts     punto de entrada: menú, partidas locales y en red, escalado del lienzo
src/game/hub.ts      registro de juegos (cómo se crea cada uno en local, anfitrión o invitado)
src/game/core/       compartido: config común, rng, teclado, ajustes, nombres, primitivas de dibujo,
                     fuente de píxeles y efecto CRT
src/game/ui/         menú HTML
src/game/net/        red genérica: host, guest, rtc, relay, signaling, types (HostGame/GuestGame)
src/game/bomberman/  Bomberman: ECS (components, ecs, systems/), mapgen, render/, snapshot, net
src/game/karts/      Karts: track (circuitos), terrain (relieve), physics, race (árbitro + IA), render (3D), input, game
src/game/balls/      Sumo de bolas: arena (física + IA + árbitro), render (3D de bloques), input, game
src/game/stick/      Monigotes: stages, fight (física + armas + bots + árbitro), render, input, game
src/game/ruleta/     Ruleta de cartuchos: match (reglas + árbitro), bot, models y textures (Three.js), render, input, game
src/game/blocks/     Bloques: world (generación + rayo), mesher (chunks), player (física), pilot, atlas, render (3D), input, game;
                     supervivencia: items, inventory, crafting (recetas), craftui (pantalla con ratón), icons, drops,
                     mobs (animales y monstruos), vitals (vida, hambre y aire), furnace (horno), daycycle (día y noche)
src/game/deadzone/   Dead Zone: Outbreak (portado de DeadZoneOutbreak): game (anfitrión e invitado), stage (3D: cielo, luces, sombras, calidad
                     adaptativa), hud, core/input, enemies (IA y modelos), weapons (datos, mejora, modelos 3D y vista), world (mapa, rutas,
                     caja/mejorador/interruptor en centerpiece, decoración, fusión de geometría, cielo), fx (partículas, clima, postproceso),
                     game/ (rondas, puntos, interacciones), player
src/game/pool/       Billar: table (física + línea de tiro), match (reglas + árbitro), bot, render (3D + HUD), input, game
src/game/casino/     Casino de deudas: balance (rondas, topes, guardias, borrachos…), ventanilla, mech (palanca/timbre/alarma), drunk,
                     events, table (mesas), npc, world3d, scene (3D), hud, input, game (anfitrión e invitado)
src/server/signal.ts emparejamiento y relé (compartido por Vercel y el servidor local)
api/signal.ts        función serverless de Vercel
scripts/serve.mjs    servidor local (juego + API en memoria)
src/extension.ts     extensión de VS Code (webview)
test/                pruebas: npm test (lógica en Node, ~3 s) · test/browser/ escenarios de capturas
scripts/shot.mjs     capturas en Edge sin ventana: npm run shot -- test/browser/survival.mjs
```

Para extender el proyecto (añadir juegos, contrato de red, trampas conocidas) lee [MEMORIA.md](MEMORIA.md).
