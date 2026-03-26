# Deploy en VPS con Dokploy

Guia para desplegar utp-calendar-bot en una VPS usando [Dokploy](https://dokploy.com/).

---

## Requisitos previos

- VPS con Dokploy instalado y funcionando
- Repositorio del proyecto en GitHub (o GitLab/Gitea)
- Token de Telegram y Chat ID configurados (ver `docs/telegram-setup.md`)
- Credenciales de UTP+ Class (codigo de alumno y contrasena)

---

## 1. Crear la aplicacion en Dokploy

1. En el panel de Dokploy, ir a **Projects** y crear un nuevo proyecto (ej: `utp-calendar-bot`).
2. Dentro del proyecto, crear un nuevo servicio de tipo **Application**.
3. Configurar el origen del codigo:
   - **Provider**: GitHub (o el que uses)
   - **Repository**: seleccionar el repositorio de `utp-calendar-bot`
   - **Branch**: `main`
   - **Build Path**: `/` (raiz del repositorio)

---

## 2. Configurar el tipo de build

En la configuracion del servicio:

- **Build Type**: `Docker Compose`
- **Docker Compose Path**: `docker-compose.yml` (el archivo que ya esta en el repo)

> Dokploy detecta el `docker-compose.yml` y usa el `Dockerfile` multi-stage para construir la imagen.

---

## 3. Variables de entorno

En la seccion **Environment** del servicio en Dokploy, agregar TODAS las variables. Copiar el contenido de `.env.example` y reemplazar con valores reales:

```env
# UTP+ Class
UTP_USERNAME=tu_codigo_de_alumno
UTP_PASSWORD=tu_contrasena_real
UTP_BASE_URL=https://class.utp.edu.pe
UTP_CALENDAR_PATH=/student/calendar
UTP_COURSES_PATH=/student/courses

# Telegram
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=987654321

# Scheduler
SCRAPE_CRON=0 */6 * * *
MORNING_REMINDER_CRON=0 6 * * 1-6
CLASS_REMINDER_MINUTES=30

# Database
DATABASE_PATH=/app/data/utp.db

# App
TZ=America/Lima
LOG_LEVEL=info
NODE_ENV=production
```

**IMPORTANTE**: el `DATABASE_PATH` en produccion DEBE ser `/app/data/utp.db` (ruta absoluta dentro del contenedor), no `./data/utp.db`.

---

## 4. Volumen persistente

El bot guarda dos cosas en el directorio `/app/data`:
- `utp.db` — Base de datos SQLite con cursos, clases, actividades
- `storage-state.json` — Sesion de Playwright (cookies de login)

El `docker-compose.yml` ya declara un volumen `bot-data` montado en `/app/data`. Dokploy lo maneja automaticamente.

Si necesitas configurarlo manualmente en Dokploy:
- **Volumes**: `bot-data:/app/data`
- **Type**: Named volume (persiste entre deploys)

> Sin este volumen, cada deploy borra la base de datos y la sesion. El bot tendria que re-loguearse y re-scrapear desde cero.

---

## 5. Deploy

1. En Dokploy, click en **Deploy**.
2. El build tarda entre 3-5 minutos la primera vez (descarga la imagen de Playwright con Chromium).
3. Verificar en los logs que el bot arranca correctamente:
   ```
   UTP+ Calendar Bot starting...
   Database initialized
   Bot commands registered
   Telegram bot created
   UTP+ Calendar Bot is running
   ```

---

## 6. Primer scrape

Despues del primer deploy, la base de datos esta vacia. Hay que ejecutar el primer scrape:

1. Abrir Telegram.
2. Enviar `/refresh` al bot.
3. Esperar ~30-60 segundos (el primer login puede tardar un poco mas).
4. El bot responde con el resultado del scrape.

A partir de ahi, el cron job scrapea automaticamente cada 6 horas (configurable con `SCRAPE_CRON`).

---

## 7. Verificar que funciona

Enviar estos comandos al bot en Telegram:

| Comando | Que deberia responder |
|---|---|
| `/status` | Estado del bot, ultimo scrape, uptime |
| `/cursos` | Lista de cursos academicos con profesor |
| `/hoy` | Clases de hoy + actividades que vencen hoy |
| `/actividades` | Todas las actividades pendientes por tipo |
| `/pendientes` | Solo las que vencen en los proximos 3 dias |

---

## 8. Actualizaciones

Para desplegar una nueva version:

1. Push de cambios a la rama `main`.
2. En Dokploy, click en **Deploy** (o configurar autodeploy via webhook).
3. El volumen `bot-data` persiste — la base de datos y la sesion se mantienen entre deploys.

---

## 9. Troubleshooting

### El bot no arranca

Revisar los logs en Dokploy. Causas comunes:

| Error | Causa | Solucion |
|---|---|---|
| `Configuration error. Missing or invalid environment variables` | Faltan variables de entorno | Verificar que TODAS las variables estan configuradas en Dokploy |
| `SQLITE_IOERR` | Problema con el volumen de datos | Verificar que el volumen `/app/data` esta montado correctamente |
| `browserType.launch: Executable doesn't exist` | Version de Playwright no coincide | El tag de la imagen en el Dockerfile debe coincidir con la version en `package.json`. Actualmente: `v1.58.2` |

### El scrape falla

| Error | Causa | Solucion |
|---|---|---|
| `Login verification failed` | Credenciales incorrectas o cambio de SSO | Verificar `UTP_USERNAME` y `UTP_PASSWORD`. Probar login manual en class.utp.edu.pe |
| `Browser operation failed` | Chromium no puede lanzarse | Verificar que el Dockerfile usa la imagen oficial de Playwright |
| `Timeout waiting for calendar` | La SPA tarda en cargar | Puede ser un problema temporal. El proximo cron lo reintenta |

### La sesion expira

El bot guarda la sesion de login en `storage-state.json`. Si la sesion de Keycloak expira (normalmente dura varios dias), el bot se re-loguea automaticamente en el siguiente scrape.

Si necesitas forzar un re-login, elimina el archivo de sesion:
```bash
# Acceder al contenedor
docker exec -it <container_id> rm -f /app/data/storage-state.json
```

### Revisar logs

En Dokploy, los logs estan en la seccion **Logs** del servicio.

Tambien se puede acceder via SSH:
```bash
docker logs <container_id> --tail 100 -f
```

Para ver logs con mas detalle, cambiar `LOG_LEVEL=debug` en las variables de entorno y re-deployar.

---

## Arquitectura del contenedor

```
Container (mcr.microsoft.com/playwright:v1.58.2-noble)
|
|-- /app/dist/index.js      <- Codigo compilado (CJS)
|-- /app/node_modules/       <- Dependencias
|-- /app/package.json
|
|-- /app/data/               <- VOLUMEN PERSISTENTE
|   |-- utp.db               <- Base de datos SQLite
|   |-- storage-state.json   <- Sesion de Playwright
|   |-- screenshots/         <- Capturas de pantalla en caso de error
```

---

## Notas sobre la imagen de Playwright

La imagen de produccion (`mcr.microsoft.com/playwright:v1.58.2-noble`) es pesada (~1.5 GB) porque incluye Chromium y sus dependencias del sistema. Esto es necesario porque el bot usa un navegador real para:

1. Hacer login via Keycloak SSO (no hay API publica de autenticacion)
2. Interceptar las llamadas API internas de la SPA

El scraping en si es rapido (~30 segundos) porque toda la data viene de las APIs interceptadas, no del DOM.
