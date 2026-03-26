# UTP+ Calendar Bot

> Bot de Telegram que scrapea el calendario de UTP+ Class y envia notificaciones inteligentes

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-3178C6?logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-1.58-45ba4b?logo=playwright&logoColor=white)
![Telegram Bot](https://img.shields.io/badge/Telegram-Bot-26A5E4?logo=telegram&logoColor=white)

---

## ¿Que hace?

### El problema

UTP+ Class es una SPA personalizada (construida por Xpedition) que **no ofrece exportacion de calendario**, no tiene notificaciones utiles, y no te avisa cuando cambia el horario o cuando cancelan una clase. Si querés saber tus proximas clases, tenes que entrar manualmente a la plataforma.

### La solución

Este bot automatiza todo eso:

- **Scraping automatico del calendario y cursos** — usa Playwright para navegar la plataforma como si fueras vos, e intercepta las llamadas internas de la SPA para obtener datos JSON directamente
- **Deteccion de cambios** — compara el estado actual con el anterior y detecta clases nuevas, canceladas o modificadas
- **Notificaciones push via Telegram** — te avisa en el momento cuando algo cambia
- **Recordatorios antes de cada clase** — te manda un mensaje configurable N minutos antes de que empiece tu clase
- **Resumen matutino diario** — cada manana (lunes a sabado) recibis un resumen de tus clases del dia con links de Zoom

---

## Requisitos previos

Antes de instalar, asegurate de tener:

| Requisito | Descripcion |
|-----------|-------------|
| **Node.js 20+** | Necesario para ejecutar el bot localmente. [Descargar](https://nodejs.org/) |
| **Cuenta de Telegram** | Para recibir las notificaciones |
| **Bot Token de Telegram** | Crealo con [@BotFather](https://t.me/BotFather) usando `/newbot` |
| **Credenciales UTP+ Class** | Tu codigo de alumno y contraseña institucional |
| **Docker** *(opcional)* | Para ejecutar en contenedor o en un VPS |

### Como obtener el `TELEGRAM_CHAT_ID`

1. Buscá [@userinfobot](https://t.me/userinfobot) en Telegram
2. Mandá cualquier mensaje
3. Te responde con tu Chat ID

---

## Instalacion rapida

### Opcion 1: Local sin Docker

```bash
git clone <url-del-repo>
cd utp-calendar-bot

# Instala dependencias y crea el .env
npm run setup

# Edita el .env con tus credenciales
# (Ver seccion "Configuracion" mas abajo)

# Inicia en modo desarrollo (con hot reload)
npm run dev
```

### Opcion 2: Local con Docker

```bash
# Clona el repositorio
git clone <url-del-repo>
cd utp-calendar-bot

# Copia el archivo de variables de entorno
cp .env.example .env

# Edita .env con tus credenciales reales
# (Ver seccion "Configuracion" mas abajo)

# Levanta con Docker en modo local (hot reload activado)
npm run local:up
# o directamente:
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

### Opcion 3: VPS con Dokploy

Dokploy permite deployar directamente desde Git con variables de entorno gestionadas en su UI.

1. Crea una nueva app en tu panel de Dokploy
2. Conecta el repositorio Git (GitHub, GitLab, etc.)
3. Configura todas las variables de entorno en **Dokploy → App → Environment**
4. El `Dockerfile` incluido esta listo para produccion con soporte para Playwright
5. Activa el deploy automatico en cada push a `main`
6. Verificá que el bot este corriendo con el comando `/status` en Telegram

> **Nota:** El `docker-compose.yml` ya tiene la etiqueta `dokploy.enable=true` configurada.

---

## Configuracion

Todas las configuraciones se hacen mediante variables de entorno en el archivo `.env`.

### Variables de entorno

| Variable | Descripcion | Requerida | Default |
|----------|-------------|-----------|---------|
| `UTP_USERNAME` | Codigo de alumno de UTP+ Class | ✅ Si | — |
| `UTP_PASSWORD` | Contraseña institucional de UTP+ Class | ✅ Si | — |
| `UTP_BASE_URL` | URL base de la plataforma | No | `https://class.utp.edu.pe` |
| `UTP_CALENDAR_PATH` | Ruta interna de la SPA para el calendario | No | `/student/calendar` |
| `UTP_COURSES_PATH` | Ruta interna de la SPA para los cursos | No | `/student/courses` |
| `TELEGRAM_BOT_TOKEN` | Token del bot creado con @BotFather | ✅ Si | — |
| `TELEGRAM_CHAT_ID` | Tu Chat ID de Telegram (donde llegan las notificaciones) | ✅ Si | — |
| `SCRAPE_CRON` | Expresion cron para el scraping periodico | No | `0 */6 * * *` (cada 6 hs) |
| `MORNING_REMINDER_CRON` | Expresion cron para el resumen matutino | No | `0 6 * * 1-6` (6 AM lun-sab) |
| `CLASS_REMINDER_MINUTES` | Minutos antes de una clase para enviar recordatorio | No | `30` |
| `DATABASE_PATH` | Ruta del archivo SQLite | No | `./data/utp.db` |
| `TZ` | Zona horaria del servidor | No | `America/Lima` |
| `LOG_LEVEL` | Nivel de logging: `debug`, `info`, `warn`, `error` | No | `info` |
| `NODE_ENV` | Modo de la app: `production` o `development` | No | `production` |

### Ejemplo de `.env`

```env
# Credenciales UTP
UTP_USERNAME=1234567890
UTP_PASSWORD=miContrasenaUTP

# Telegram
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=987654321

# Scheduler (valores por defecto)
SCRAPE_CRON=0 */6 * * *
MORNING_REMINDER_CRON=0 6 * * 1-6
CLASS_REMINDER_MINUTES=30

# App
TZ=America/Lima
LOG_LEVEL=info
NODE_ENV=production
```

---

## Comandos del bot

Una vez que el bot este corriendo, podes usar estos comandos en Telegram:

| Comando | Descripcion |
|---------|-------------|
| `/start` | Inicia el bot y muestra el menu de comandos |
| `/hoy` | Clases y tareas con vencimiento de hoy |
| `/manana` | Clases y tareas de manana |
| `/semana` | Horario semanal completo |
| `/cursos` | Lista de cursos activos del semestre |
| `/tareas` | Todas las tareas pendientes con indicador de urgencia |
| `/zoom` | Links de Zoom activos (del calendario y de los cursos) |
| `/refresh` | Ejecuta un scrape inmediato sin esperar el cron |
| `/status` | Estado del bot, ultimo scrape, uptime y estadisticas |
| `/help` | Lista completa de comandos |

---

## Como funciona

El bot sigue este flujo de datos:

```
┌─────────────────────┐
│   Scheduler / Cron  │  ← node-cron: cada 6 hs + 6 AM + cada minuto
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Playwright Scraper │  ← Chromium headless
│  (browser.ts)       │
└─────────┬───────────┘
          │ navega como usuario real
          ▼
┌─────────────────────┐
│  UTP+ Class SPA     │  ← https://class.utp.edu.pe
│  (login → calendar  │
│   → courses)        │
└─────────┬───────────┘
          │
          ▼
┌──────────────────────────┐
│  Parser + Interceptor    │  ← intercepta llamadas JSON de la SPA
│  (parser.ts /            │     o parsea el DOM si no hay API
│   interceptor.ts)        │
└─────────┬────────────────┘
          │
          ▼
┌─────────────────────┐
│  SQLite DB (Drizzle) │  ← persistencia de clases, cursos, tareas
│  (schema.ts /        │
│   queries.ts)        │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   Diff Engine       │  ← detecta nuevas, canceladas, modificadas
│   (diff.ts)         │
└─────────┬───────────┘
          │
          ▼
┌──────────────────────────┐
│  Telegram Bot (Telegraf) │  ← envia notificaciones de cambios
│  (bot/notifications.ts)  │     y responde comandos
└──────────────────────────┘
```

### Flujo detallado

1. **Cron activa el scrape** → `scheduler/cron.ts`
2. **Playwright abre Chromium** en modo headless → `scraper/browser.ts`
3. **Login** → navega el formulario de autenticacion → `scraper/login.ts`
4. **Interceptor activado** → captura todas las respuestas JSON de la SPA → `scraper/interceptor.ts`
5. **Scraping del calendario** → obtiene clases de la semana → `scraper/calendar.ts`
6. **Scraping de cursos** → lista de materias del semestre → `scraper/courses.ts`
7. **Detalle de cada curso** → links de Zoom, tareas → `scraper/course-detail.ts`
8. **Diff Engine** → compara contra lo que hay en SQLite → `scheduler/diff.ts`
9. **Si hay cambios** → manda notificacion via Telegram → `bot/notifications.ts`
10. **Recordatorios** → el cron de cada minuto verifica si hay clases proximas → `scheduler/reminders.ts`

---

## Deploy en Dokploy

### Paso a paso

**1. Crea la app en Dokploy**
- Inicia sesion en tu instancia de Dokploy
- Click en **New Application**
- Selecciona tipo: **Docker Compose** o **Application**

**2. Conecta el repositorio Git**
- Vincula tu cuenta de GitHub/GitLab en Dokploy
- Selecciona este repositorio
- Rama: `main`

**3. Configura las variables de entorno**
- Ir a **App → Environment Variables**
- Agregar TODAS las variables listadas en la seccion "Configuracion"
- Las variables obligatorias son: `UTP_USERNAME`, `UTP_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

**4. Configura el volumen para persistencia**
- Ir a **App → Mounts/Volumes**
- Crear volumen: ruta del contenedor `/app/data`
- Esto asegura que la base de datos SQLite sobreviva los redeploys

**5. Activa el deploy automatico**
- En **App → Deployments**, activa "Auto Deploy on Push"
- Cada push a `main` lanzara un nuevo deploy

**6. Primer deploy**
- Click en **Deploy** y espera que termine el build
- El Dockerfile usa multi-stage: Node 20 para el build, imagen oficial de Playwright para produccion

**7. Verifica que funciona**
- En Telegram, mandá `/status` al bot
- Deberias ver uptime, estadisticas y el estado del ultimo scrape

---

## Estructura del proyecto

```
utp-calendar-bot/
│
├── src/                          # Codigo fuente principal
│   ├── index.ts                  # Entry point: inicializa bot, DB, scheduler
│   ├── config.ts                 # Carga y valida variables de entorno con Zod
│   ├── logger.ts                 # Logger estructurado con Pino
│   │
│   ├── bot/                      # Modulo del bot de Telegram (Telegraf)
│   │   ├── index.ts              # Inicializacion del bot y setup de middleware
│   │   ├── commands.ts           # Registro de todos los comandos (/hoy, /semana, etc.)
│   │   ├── formatters.ts         # Funciones de formato de mensajes en MarkdownV2
│   │   └── notifications.ts     # Envio de notificaciones: cambios, recordatorios, matutino
│   │
│   ├── scraper/                  # Modulo de scraping con Playwright
│   │   ├── browser.ts            # Factory del browser headless (singleton)
│   │   ├── login.ts              # Flujo de autenticacion en UTP+ Class
│   │   ├── calendar.ts           # Scraping de la vista /student/calendar
│   │   ├── courses.ts            # Scraping de la lista /student/courses
│   │   ├── course-detail.ts     # Scraping de detalle de cada curso (Zoom, tareas)
│   │   ├── tasks.ts              # Deduplicacion y normalizacion de tareas
│   │   ├── parser.ts             # Parseo de HTML/DOM → tipos TypeScript
│   │   ├── interceptor.ts        # Intercepta llamadas JSON de la SPA (estrategia preferida)
│   │   └── selectors.ts          # Selectores CSS y endpoints API conocidos
│   │
│   ├── scheduler/                # Modulo de programacion de tareas
│   │   ├── cron.ts               # Jobs de cron: scrape periodico, resumen matutino
│   │   ├── diff.ts               # Motor de deteccion de cambios (added/removed/modified)
│   │   └── reminders.ts          # Verificacion de clases proximas (cada 1 minuto)
│   │
│   └── db/                       # Modulo de base de datos (Drizzle ORM + SQLite)
│       ├── index.ts              # Inicializacion de la conexion SQLite
│       ├── schema.ts             # Definicion de tablas con Drizzle
│       ├── queries.ts            # Todas las queries encapsuladas
│       └── migrations/           # Migraciones generadas por drizzle-kit
│
├── scripts/
│   ├── scrape-once.ts            # Script para ejecutar un scrape manual (npm run scrape)
│   └── setup.sh                  # Script de setup inicial (instala deps, crea .env)
│
├── data/                         # Carpeta de datos persistentes (en .gitignore)
│   └── utp.db                    # Base de datos SQLite (se crea automaticamente)
│
├── Dockerfile                    # Multi-stage: Node 20 build → Playwright produccion
├── docker-compose.yml            # Compose para produccion / Dokploy
├── docker-compose.local.yml      # Override para desarrollo local con hot reload
├── drizzle.config.ts             # Configuracion de Drizzle Kit (migraciones)
├── tsconfig.json                 # Configuracion TypeScript
├── tsup.config.ts                # Configuracion del bundler (tsup)
├── package.json                  # Dependencias y scripts
├── .env.example                  # Plantilla de variables de entorno
└── .gitignore                    # Ignora node_modules, data/, .env
```

---

## Personalizacion — Selectores CSS

UTP+ Class es una SPA construida por Xpedition con selectores CSS que **pueden cambiar entre actualizaciones** de la plataforma. Si el bot deja de scrapear correctamente, probablemente los selectores quedaron desactualizados.

### Estrategia recomendada: interceptor.ts

En vez de depender de selectores CSS frágiles, la estrategia preferida es **interceptar las llamadas API internas** que hace la SPA al cargar las vistas. Esto es mas robusto porque los datos JSON son mas estables que el HTML.

El archivo `src/scraper/interceptor.ts` ya implementa esta estrategia. Cuando navegues a `/student/calendar`, la SPA hace llamadas AJAX que el interceptor captura automaticamente.

### Estrategia de respaldo: selectores DOM

Si la SPA no expone endpoints claros, el archivo `src/scraper/selectors.ts` contiene los selectores CSS actuales. Estos son los que necesitas actualizar.

---

## Guia de descubrimiento de selectores

Si los selectores quedaron desactualizados o queres descubrir nuevos endpoints API, seguí estos pasos:

### Paso 1 — Playwright Codegen (modo interactivo)

```bash
npx playwright codegen https://class.utp.edu.pe/
```

Esto abre un navegador donde podes navegar normalmente mientras Playwright graba los selectores de cada elemento que tocas. Ideal para mapear el flujo de login y navegacion.

### Paso 2 — DevTools > Network para descubrir endpoints API

1. Abri Chrome DevTools (`F12`)
2. Ir a la pestana **Network**
3. Filtrar por **Fetch/XHR**
4. Navegá a `/student/calendar` y `/student/courses`
5. Observa las llamadas que hace la SPA → esos son los endpoints reales
6. Copiá las URLs y actualizalas en `API_ENDPOINTS` dentro de `selectors.ts`

### Paso 3 — DevTools > Elements para selectores DOM

Si necesitas selectores para parseo directo del DOM:

1. Click derecho en el elemento que queres capturar → **Inspect**
2. En DevTools > Elements, busca atributos estables: `data-*`, `id`, clases semanticas
3. **Evitá** usar clases generadas (como `sc-abc123`) ya que cambian con cada build

### Paso 4 — Actualizar selectors.ts

```typescript
// src/scraper/selectors.ts
export const SELECTORS = {
  // Reemplaza con los selectores actualizados
  loginForm: 'tu-selector-actualizado',
  // ...
};

export const API_ENDPOINTS = {
  // Si encontraste los endpoints reales, actualizalos aca
  calendar: '/api/v2/student/calendar',
  courses: '/api/v2/student/courses',
};
```

### Paso 5 — Priorizar interceptor.ts si encontraste endpoints

Si en el Paso 2 encontraste los endpoints reales de la API, **actualiza `API_ENDPOINTS` en `selectors.ts`** y luego modifica `interceptor.ts` para usar esas rutas en lugar de deteccion por patron. Esto es mas confiable que el parsing de HTML.

---

## Scripts disponibles

| Script | Comando | Descripcion |
|--------|---------|-------------|
| `dev` | `npm run dev` | Inicia en modo desarrollo con hot reload (tsx watch) |
| `build` | `npm run build` | Compila TypeScript a JavaScript en `/dist` |
| `start` | `npm run start` | Ejecuta el build compilado (modo produccion) |
| `scrape` | `npm run scrape` | Ejecuta un scrape manual unico (util para testing) |
| `setup` | `npm run setup` | Script de instalacion inicial (npm install + .env) |
| `db:push` | `npm run db:push` | Aplica el schema de Drizzle a la base de datos |
| `db:studio` | `npm run db:studio` | Abre Drizzle Studio (UI visual de la DB) |
| `lint` | `npm run lint` | Verifica errores de tipos con TypeScript (`tsc --noEmit`) |
| `docker:build` | `npm run docker:build` | Construye la imagen Docker |
| `docker:up` | `npm run docker:up` | Levanta los contenedores en background |
| `docker:logs` | `npm run docker:logs` | Muestra los logs del contenedor en tiempo real |
| `docker:down` | `npm run docker:down` | Detiene y elimina los contenedores |
| `local:up` | `npm run local:up` | Levanta con docker-compose local (hot reload) |
| `dokploy:deploy` | `npm run dokploy:deploy` | Deploy para Dokploy (build + up) |

---

## Troubleshooting

### El login falla

**Sintomas:** El scrape lanza error de autenticacion, el log muestra `Login failed` o `Navigation timeout`.

**Soluciones:**
1. Verificá que `UTP_USERNAME` y `UTP_PASSWORD` sean correctos entrando manualmente en https://class.utp.edu.pe
2. Si las credenciales son correctas, es posible que el flujo de SSO (Single Sign-On) de la plataforma haya cambiado → revisá `src/scraper/login.ts` y actualizá los selectores del formulario con Playwright Codegen (ver "Guia de descubrimiento de selectores")
3. Si UTP tiene doble factor de autenticacion activado, el bot no puede manejarlo automaticamente

---

### Los selectores no matchean / no se scrapean datos

**Sintomas:** El scrape termina exitosamente pero con 0 clases o 0 cursos encontrados.

**Soluciones:**
1. Ejecuta `npx playwright codegen https://class.utp.edu.pe/` y navegá manualmente para ver los selectores actuales
2. Abrí DevTools > Network en el navegador para descubrir los endpoints API reales
3. Actualizá `src/scraper/selectors.ts` con los selectores nuevos
4. Si encontraste endpoints JSON, priorizá la estrategia del interceptor

---

### El bot no responde en Telegram

**Sintomas:** Mandas un comando al bot y no hay respuesta.

**Soluciones:**
1. Verificá que `TELEGRAM_BOT_TOKEN` sea correcto (debe incluir el numero y los caracteres despues de `:`)
2. Verificá que `TELEGRAM_CHAT_ID` sea tu ID personal (no el username, sino el numero)
3. Confirma que el bot esta corriendo: revisá los logs con `npm run docker:logs` o `docker compose logs -f`
4. Asegurate de haber mandado `/start` al bot al menos una vez

---

### Errores de base de datos

**Sintomas:** El bot crashea con errores de SQLite, tipos incorrectos, o schema desactualizado.

**Soluciones:**
1. Detén el bot
2. Eliminá la base de datos: `rm data/utp.db` (o el path configurado en `DATABASE_PATH`)
3. Reiniciá el bot → la DB se crea automaticamente con el schema correcto
4. Si el error persiste, ejecutá `npm run db:push` para forzar la sincronizacion del schema

---

### El build de Docker falla

**Sintomas:** `docker compose build` falla con errores relacionados a Playwright o npm.

**Soluciones:**
1. Verificá que la version de Playwright en el `Dockerfile` coincida con la version instalada en `package.json`:
   ```
   # Dockerfile linea 10
   FROM mcr.microsoft.com/playwright:v1.49.0-noble  ← debe coincidir con
   # package.json
   "playwright": "^1.58.2"  ← la version mayor/menor
   ```
2. Si las versiones no coinciden, actualizá la imagen en el `Dockerfile` para que use la misma version de Playwright que el `package.json`
3. Probá con `docker system prune` para limpiar caches de builds anteriores

---

### No llegan notificaciones de cambios

**Sintomas:** El scrape corre correctamente pero no te llega ningun mensaje cuando cambia algo.

**Soluciones:**
1. Verificá que el `TELEGRAM_CHAT_ID` sea el tuyo y no el de un grupo
2. Revisá que no hayas bloqueado el bot en Telegram
3. Aumentá el `LOG_LEVEL=debug` para ver en detalle que detecta el diff engine
4. Corré `npm run scrape` manualmente para forzar un scrape y observá los logs

---

## Tecnologias

| Tecnologia | Descripcion |
|------------|-------------|
| [Node.js 20](https://nodejs.org/) | Runtime de JavaScript |
| [TypeScript 5](https://www.typescriptlang.org/) | Tipado estatico |
| [Playwright](https://playwright.dev/) | Scraping con Chromium headless |
| [Telegraf](https://telegraf.js.org/) | Framework para bots de Telegram |
| [Drizzle ORM](https://orm.drizzle.team/) | ORM type-safe para SQLite |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Driver SQLite sincrono |
| [node-cron](https://github.com/kelektiv/node-cron) | Programacion de tareas con expresiones cron |
| [Zod](https://zod.dev/) | Validacion de schema y variables de entorno |
| [Pino](https://getpino.io/) | Logger JSON de alto rendimiento |
| [tsup](https://tsup.egoist.dev/) | Bundler para TypeScript |
| [Docker](https://www.docker.com/) | Contenedores para deploy |
| [Dokploy](https://dokploy.com/) | PaaS self-hosted para VPS |

---

## Licencia

MIT — libre para usar, modificar y distribuir.
