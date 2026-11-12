# Jet Lag Planner

Plan de jet lag día a día (sueño, luz, comidas, cafeína, azúcar) en español, para usar en el iPhone como web instalable.

```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm test           # tests del motor, ciudades, avisos, contraste y guardado (Vitest)
npm run build      # comprueba tipos y genera dist/
npm run cities     # regenera public/data/cities.json desde GeoNames
npm run icons      # regenera los iconos de public/icons
```

## Estructura

- `src/core/` motor sin DOM
  - `plan.ts`: cadena de CBTmin con el estado del reloj (fase) arrastrado entre tramos; `startAt`, ida y vuelta, escalas, estancias cortas, cambios de hora y `arrivalRoutine` (primeros 3 días tras cada llegada).
  - `alerts.ts`: avisos push "En 30 minutos, …", por categoría, con tope diario y sin nada durante el sueño salvo el despertar.
  - `time.ts`, `sun.ts`: zonas horarias con `Intl` y amanecer/atardecer.
- `src/cities/`: 110 ciudades con nombre en español y unas 32 000 de GeoNames (CC BY 4.0) cargadas en segundo plano, con búsqueda por texto.
- `src/ui/`: pantallas (Viajes, asistente de 6 pasos, Hoy, Calendario, Lista), guardado en IndexedDB (migra lo que hubiera en `localStorage` del prototipo) y avisos push del lado del navegador.
- `public/`: `manifest.webmanifest`, `sw.js` (sin conexión + avisos push), iconos y base de ciudades.
- `tests/fixtures/prototype-core.js`: motor original del prototipo; `tests/regression.test.ts` comprueba que el nuevo da lo mismo en viajes simples.

## Avisos push (Vercel)

El navegador no puede programar avisos por sí solo, así que `api/` es un pequeño servidor en Vercel:

- `POST /api/subscribe` guarda la suscripción y los avisos de un viaje `{ subscription, trip, alerts: [{ id, at, title, body }] }` en Upstash Redis. Solo eso: ni ciudades ni horarios de sueño. `DELETE` lo borra todo.
- `POST /api/tick` envía los avisos que tocan. Solo acepta llamadas firmadas por QStash o con `Authorization: Bearer $CRON_SECRET`. Descarta los que llegarían más de 15 min tarde y olvida las suscripciones caducadas.
- `POST /api/test` manda un aviso de prueba.

La lógica está en `api/_lib/logic.ts` y se prueba en `tests/server.test.ts` sin Redis.

### Puesta en marcha

1. Importa el repositorio en Vercel (detecta Vite; `vercel.json` ya indica la compilación).
2. **Storage → Marketplace → Upstash Redis**, conectado al proyecto. Crea `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
3. Genera las claves con `npx web-push generate-vapid-keys` y añade en **Settings → Environment Variables** las de `.env.example`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` con tu correo), `VITE_VAPID_PUBLIC_KEY` (la misma pública) y `CRON_SECRET` (cualquier texto largo aleatorio). Vuelve a desplegar.
4. Planificación cada 2 minutos con **QStash** (Upstash), porque el Cron de Vercel en el plan gratuito solo se ejecuta una vez al día. En la consola de Upstash → QStash → tu región: copia las **Signing Keys** a Vercel como `QSTASH_CURRENT_SIGNING_KEY` y `QSTASH_NEXT_SIGNING_KEY` y vuelve a desplegar. Después, en **Schedules → Create Schedule**: URL `https://tu-app.vercel.app/api/tick` y cabecera `Upstash-Cron` = `*/2 * * * *`. QStash firma cada llamada y `/api/tick` comprueba la firma. (Alternativa: `scripts/qstash-schedule.mjs`, que usa `CRON_SECRET`; o Vercel Cron en el plan Pro.)
5. En el iPhone (iOS 16.4 o superior): abre la web en Safari → Compartir → Añadir a pantalla de inicio → abre la app → Hoy → Avisos en el móvil → Activar avisos → Enviar aviso de prueba.

Es un modelo simplificado, no consejo médico.
