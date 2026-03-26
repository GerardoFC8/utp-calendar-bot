# UTP+ Calendar Bot

> Bot de Telegram que scrapea el calendario de UTP+ Class y envia notificaciones inteligentes

![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-1.58-45ba4b?logo=playwright&logoColor=white)
![Telegram Bot](https://img.shields.io/badge/Telegram-Bot-26A5E4?logo=telegram&logoColor=white)

---

## Que hace

### El problema

UTP+ Class es una SPA (construida por Xpedition) que **no ofrece exportacion de calendario**, no tiene notificaciones utiles, y no te avisa cuando cambia el horario, cuando cancelan una clase o cuando vence una actividad. Si queres saber tus proximas clases o tareas, tenes que entrar manualmente a la plataforma.

### La solucion

Este bot automatiza todo eso:

- **Scraping via API** — intercepta las llamadas internas de la SPA para obtener datos JSON directamente (cursos, clases, actividades con fechas limite)
- **Deteccion de cambios** — compara el estado actual con el anterior y detecta clases nuevas, canceladas o modificadas
- **Notificaciones push via Telegram** — te avisa en el momento cuando algo cambia
- **Recordatorios antes de cada clase** — te manda un mensaje N minutos antes de que empiece tu clase con el link de Zoom
- **Resumen matutino diario** — cada manana (lunes a sabado) recibis un resumen de tus clases del dia
- **Actividades con fecha limite** — foros, tareas y evaluaciones agrupadas por tipo con indicador de urgencia

---

## Requisitos previos

| Requisito | Descripcion |
|-----------|-------------|
| **Node.js 22+** | Necesario para ejecutar el bot. [Descargar](https://nodejs.org/) |
| **Cuenta de Telegram** | Para recibir las notificaciones |
| **Bot Token de Telegram** | Crealo con [@BotFather](https://t.me/BotFather) usando `/newbot` (ver `docs/telegram-setup.md`) |
| **Credenciales UTP+ Class** | Tu codigo de alumno y contrasena institucional |
| **Docker** *(opcional)* | Para ejecutar en contenedor o en un VPS |

---

## Instalacion rapida

### Opcion 1: Local sin Docker

```bash
git clone <url-del-repo>
cd utp-calendar-bot
npm install
npx playwright install chromium
cp .env.example .env
# Edita .env con tus credenciales (ver docs/telegram-setup.md)
npm run dev
```

Guia completa: [`docs/setup-local.md`](docs/setup-local.md)

### Opcion 2: Docker local

```bash
git clone <url-del-repo>
cd utp-calendar-bot
cp .env.example .env
# Edita .env con tus credenciales
npm run local:up
```

### Opcion 3: VPS con Dokploy

Guia completa: [`docs/deploy-dokploy.md`](docs/deploy-dokploy.md)

---

## Configuracion

Todas las configuraciones se hacen en el archivo `.env`.

### Variables de entorno

| Variable | Descripcion | Requerida | Default |
|----------|-------------|-----------|---------|
| `UTP_USERNAME` | Codigo de alumno de UTP+ Class | Si | -- |
| `UTP_PASSWORD` | Contrasena institucional | Si | -- |
| `UTP_BASE_URL` | URL base de la plataforma | No | `https://class.utp.edu.pe` |
| `UTP_CALENDAR_PATH` | Ruta interna del calendario | No | `/student/calendar` |
| `UTP_COURSES_PATH` | Ruta interna de cursos | No | `/student/courses` |
| `TELEGRAM_BOT_TOKEN` | Token del bot de @BotFather | Si | -- |
| `TELEGRAM_CHAT_ID` | Tu Chat ID de Telegram | Si | -- |
| `SCRAPE_CRON` | Cron del scraping periodico | No | `0 */6 * * *` (cada 6 hs) |
| `MORNING_REMINDER_CRON` | Cron del resumen matutino | No | `0 6 * * 1-6` (6 AM lun-sab) |
| `CLASS_REMINDER_MINUTES` | Minutos antes de la clase para recordatorio | No | `30` |
| `DATABASE_PATH` | Ruta del archivo SQLite | No | `./data/utp.db` |
| `TZ` | Zona horaria | No | `America/Lima` |
| `LOG_LEVEL` | Nivel de log | No | `info` |
| `NODE_ENV` | Modo de la app | No | `production` |

---

## Comandos del bot

| Comando | Descripcion |
|---------|-------------|
| `/start` | Inicia el bot y muestra los comandos disponibles |
| `/hoy` | Clases de hoy con links de Zoom + actividades que vencen hoy |
| `/manana` | Clases de manana + actividades que vencen manana |
| `/semana` | Horario semanal completo de clases |
| `/cursos` | Cursos academicos activos con profesor y modalidad |
| `/actividades` | Todas las actividades pendientes agrupadas por tipo (tareas, foros, evaluaciones) |
| `/pendientes` | Actividades urgentes que vencen en los proximos 3 dias |
| `/zoom` | Links de Zoom de las proximas clases |
| `/refresh` | Ejecuta un scrape inmediato |
| `/status` | Estado del bot, ultimo scrape y estadisticas |
| `/help` | Lista de comandos |

---

## Como funciona

```
Scheduler (node-cron)
     |
     v
Playwright (Chromium headless)
     | login via Keycloak SSO
     v
UTP+ Class SPA (class.utp.edu.pe)
     |
     v
API Interceptor -- captura JSON de api-pao.utpxpedition.com
     |
     +-- /course/student/calendar          -> Clases con Zoom
     +-- /course/student/calendar/activities -> Actividades con deadline
     +-- /course/student/activities/pending  -> Pendientes
     +-- /learning/student/{id}/dashboard-courses -> Cursos
     |
     v
SQLite (Drizzle ORM) -- persiste cursos, clases, actividades
     |
     v
Diff Engine -- detecta added/removed/modified
     |
     v
Telegram Bot (Telegraf) -- comandos + notificaciones push
```

El scrape toma ~30 segundos porque toda la data viene directamente de las APIs interceptadas, no del DOM.

---

## Estructura del proyecto

```
utp-calendar-bot/
|
|-- src/
|   |-- index.ts              # Entry point
|   |-- config.ts             # Validacion de env con Zod
|   |-- logger.ts             # Logger estructurado (Pino)
|   |
|   |-- bot/                  # Modulo de Telegram
|   |   |-- index.ts          # Inicializacion del bot
|   |   |-- commands.ts       # Registro de comandos
|   |   |-- formatters.ts     # Formato de mensajes MarkdownV2
|   |   |-- notifications.ts  # Envio de notificaciones
|   |
|   |-- scraper/              # Modulo de scraping
|   |   |-- browser.ts        # Factory del browser headless
|   |   |-- login.ts          # Login via Keycloak SSO
|   |   |-- calendar.ts       # Parseo de clases y actividades desde API
|   |   |-- courses.ts        # Parseo de cursos desde API
|   |   |-- tasks.ts          # Deduplicacion y categorizacion de actividades
|   |   |-- parser.ts         # Tipos (CourseData, ClassData, ActivityData)
|   |   |-- interceptor.ts    # Intercepta llamadas API de la SPA
|   |   |-- selectors.ts      # Selectores CSS y endpoints API
|   |
|   |-- scheduler/            # Modulo de cron jobs
|   |   |-- cron.ts           # Scrape periodico + recordatorios
|   |   |-- diff.ts           # Deteccion de cambios
|   |   |-- reminders.ts      # Recordatorios pre-clase
|   |
|   |-- db/                   # Base de datos
|       |-- index.ts          # Conexion SQLite
|       |-- schema.ts         # Tablas: courses, classes, activities
|       |-- queries.ts        # CRUD encapsulado
|
|-- scripts/
|   |-- scrape-once.ts        # Scrape manual (npm run scrape)
|   |-- setup.sh              # Setup inicial
|
|-- docs/
|   |-- setup-local.md        # Guia de instalacion local
|   |-- deploy-dokploy.md     # Guia de deploy en VPS con Dokploy
|   |-- telegram-setup.md     # Guia de configuracion de Telegram
|
|-- Dockerfile                # Multi-stage: Node 22 build + Playwright produccion
|-- docker-compose.yml        # Compose para produccion / Dokploy
|-- docker-compose.local.yml  # Override para desarrollo local
|-- package.json
|-- tsconfig.json
|-- tsup.config.ts
|-- .env.example
```

---

## Scripts disponibles

| Script | Comando | Descripcion |
|--------|---------|-------------|
| `dev` | `npm run dev` | Desarrollo con hot reload (tsx watch) |
| `build` | `npm run build` | Compila a JavaScript en `/dist` |
| `start` | `npm start` | Ejecuta el build compilado |
| `scrape` | `npm run scrape` | Scrape manual unico |
| `setup` | `npm run setup` | Instalacion inicial |
| `lint` | `npm run lint` | Verifica tipos con TypeScript |
| `db:studio` | `npm run db:studio` | Interfaz visual de la DB |
| `docker:up` | `npm run docker:up` | Levanta contenedores |
| `docker:logs` | `npm run docker:logs` | Logs en tiempo real |
| `docker:down` | `npm run docker:down` | Detiene contenedores |
| `local:up` | `npm run local:up` | Docker local con hot reload |

---

## Documentacion

| Guia | Contenido |
|------|-----------|
| [`docs/setup-local.md`](docs/setup-local.md) | Instalacion local paso a paso, pm2, troubleshooting |
| [`docs/deploy-dokploy.md`](docs/deploy-dokploy.md) | Deploy en VPS con Dokploy, volumenes, variables |
| [`docs/telegram-setup.md`](docs/telegram-setup.md) | Crear bot con BotFather, obtener Chat ID |

---

## Tecnologias

| Tecnologia | Uso |
|------------|-----|
| [Node.js 22](https://nodejs.org/) | Runtime |
| [TypeScript 6](https://www.typescriptlang.org/) | Tipado estatico |
| [Playwright](https://playwright.dev/) | Scraping con Chromium headless |
| [Telegraf](https://telegraf.js.org/) | Bot de Telegram |
| [Drizzle ORM](https://orm.drizzle.team/) | ORM type-safe para SQLite |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Driver SQLite |
| [node-cron](https://github.com/kelektiv/node-cron) | Cron jobs |
| [Zod 4](https://zod.dev/) | Validacion de schema |
| [Pino](https://getpino.io/) | Logger JSON |
| [tsup](https://tsup.egoist.dev/) | Bundler |
| [Docker](https://www.docker.com/) | Contenedores |
| [Dokploy](https://dokploy.com/) | PaaS self-hosted |

---

## Licencia

MIT
