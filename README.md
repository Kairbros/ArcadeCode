# Arcade: Bomberman y Karts

Hub de juegos en TypeScript + Canvas. Se juega en el navegador o dentro de VS Code (vista "Arcade"
del Explorador). Quien crea la sala elige el juego.

- **Bomberman**: mapas procedurales, cajas con 3 buffs (velocidad, rango, bombas). Local 1–2
  jugadores en un teclado o en red hasta 4.
- **Karts**: carreras con efecto modo 7 (suelo proyectado en perspectiva a 256×224, como la SNES),
  circuitos procedurales, 5 vueltas, objetos (turbo, plátano, proyectil). Local contra la IA o en red
  hasta 4; los huecos libres los ocupa la IA. En red cada jugador conduce su kart en su pantalla (sin
  retraso) y el anfitrión arbitra objetos, golpes y posiciones.

Escala de grises: botón del menú o tecla **G** (en gris, cada jugador lleva su número encima).

## Cómo funciona el modo en red

- **Anfitrión**: crea la sala, ejecuta la simulación y envía el estado (base completa de vez en
  cuando + solo los cambios en cada actualización).
- **Invitados**: envían su teclado y dibujan el estado que reciben.
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
   Alternativa sin GitHub: `npx vercel` desde esta carpeta.
   La configuración ya está en `vercel.json`; no hay que tocar nada en el asistente.
3. En el proyecto de Vercel: **Storage → Create Database → Upstash (Redis)** y conéctala al proyecto.
   Esto añade `KV_REST_API_URL` y `KV_REST_API_TOKEN`, que la API detecta sola.
   Sin base de datos el emparejamiento no es fiable (cada petición puede ir a otra instancia).
4. Vuelve a desplegar (**Deployments → Redeploy**) para que tome las variables.
5. Abre `https://TU-PROYECTO.vercel.app`. La partida sigue yendo directa entre equipos:
   para jugar en red local, todos deben estar en la misma red.

## Extensión de VS Code

- Abre esta carpeta en VS Code y pulsa **F5**; en la ventana nueva: `Ctrl+Shift+P` → **Bomberman: Jugar**.
- Para el modo en red, configura el ajuste **`bomberman.serverUrl`** con tu URL de Vercel
  (o `http://IP-DEL-EQUIPO:8000` si usas el servidor local) y reabre el panel.
- Empaquetar: `npx @vscode/vsce package` genera un `.vsix` instalable.

## Controles

| | Local | En red |
|---|---|---|
| Moverse | J1: WASD · J2: flechas | WASD o flechas |
| Bomba | J1: Espacio · J2: Enter | Espacio o Enter |
| Partida | R nuevo mapa · T repetir · 1/2 jugadores · P pausa | R / T / P (solo anfitrión) |
| Menú | Esc | Esc (sale de la partida) |

## Estructura

```
src/game/main.ts     punto de entrada: menú, partidas locales y en red
src/game/hub.ts      registro de juegos (cómo se crea cada uno en local, anfitrión o invitado)
src/game/core/       compartido: config común, rng, teclado, ajustes (grises), primitivas de dibujo
src/game/ui/         menú HTML
src/game/net/        red genérica: host, guest, rtc, relay, signaling, types (HostGame/GuestGame)
src/game/bomberman/  Bomberman: ECS (components, ecs, systems/), mapgen, render/, snapshot, net
src/game/karts/      Karts: track (circuitos), physics, race (árbitro + IA), render (modo 7), input, game
src/server/signal.ts emparejamiento (compartido por Vercel y el servidor local)
api/signal.ts        función serverless de Vercel
scripts/serve.mjs    servidor local (juego + API en memoria)
src/extension.ts     extensión de VS Code (webview)
```
