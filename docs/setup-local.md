# Instalacion y ejecucion local

Guia para ejecutar utp-calendar-bot en tu computadora personal sin necesidad de un VPS o Docker.

---

## Requisitos

| Requisito | Version minima | Como verificar |
|---|---|---|
| **Node.js** | 22+ | `node -v` |
| **npm** | 10+ | `npm -v` |
| **Git** | cualquiera | `git --version` |

No necesitas Docker. El bot corre directamente con Node.js.

> **Windows, macOS y Linux** son compatibles. Playwright descarga su propia copia de Chromium, no necesitas instalar ningun navegador extra.

---

## 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/utp-calendar-bot.git
cd utp-calendar-bot
```

---

## 2. Instalar dependencias

```bash
npm install
```

Esto instala todas las dependencias de Node.js incluyendo Playwright.

---

## 3. Instalar navegador de Playwright

Playwright necesita descargar Chromium (~170 MB). Ejecuta:

```bash
npx playwright install chromium
```

En Linux, si pide dependencias del sistema:

```bash
# Solo si falla el paso anterior
sudo npx playwright install-deps chromium
```

---

## 4. Configurar variables de entorno

Copia el archivo de ejemplo y editalo con tus datos reales:

```bash
cp .env.example .env
```

Abre `.env` con tu editor y completa:

```env
# Tu codigo de alumno UTP (ej: 1234567890)
UTP_USERNAME=tu_codigo_de_alumno

# Tu contrasena institucional
UTP_PASSWORD=tu_contrasena

# Token del bot de Telegram (ver docs/telegram-setup.md)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# Tu Chat ID de Telegram (ver docs/telegram-setup.md)
TELEGRAM_CHAT_ID=987654321
```

Las demas variables tienen valores por defecto y no necesitas cambiarlas para uso local.

> Si no tienes el bot de Telegram configurado, sigue la guia `docs/telegram-setup.md`.

---

## 5. Ejecutar el bot

### Modo desarrollo (con hot reload)

```bash
npm run dev
```

El bot se reinicia automaticamente cuando modificas archivos en `src/`.

### Modo produccion (build compilado)

```bash
npm run build
npm start
```

---

## 6. Primer uso

Una vez que el bot esta corriendo, abre Telegram:

1. Busca tu bot por el username que le diste en BotFather.
2. Envia `/start` para ver los comandos disponibles.
3. Envia `/refresh` para ejecutar el primer scrape.
4. Espera ~30-60 segundos. El bot responde con el resultado.
5. Ahora podes usar `/hoy`, `/cursos`, `/actividades`, etc.

---

## 7. Mantener el bot corriendo

El bot necesita estar ejecutandose para recibir comandos y enviar recordatorios. Opciones:

### Opcion A: Dejar la terminal abierta

Simplemente no cierres la terminal donde ejecutaste `npm run dev`. Funciona bien para pruebas.

### Opcion B: Usar un gestor de procesos (recomendado)

Con **pm2** (gestor de procesos para Node.js):

```bash
# Instalar pm2 globalmente
npm install -g pm2

# Compilar el proyecto
npm run build

# Iniciar con pm2
pm2 start dist/index.js --name utp-bot

# Ver logs en tiempo real
pm2 logs utp-bot

# Ver estado
pm2 status

# Reiniciar
pm2 restart utp-bot

# Detener
pm2 stop utp-bot

# Iniciar automaticamente con el sistema
pm2 startup
pm2 save
```

### Opcion C: Docker local

Si prefieres Docker pero no tienes VPS:

```bash
# Copia el .env primero
cp .env.example .env
# Edita .env con tus datos

# Modo desarrollo (hot reload, monta src/ como volumen)
npm run local:up

# O modo produccion
npm run docker:up

# Ver logs
npm run docker:logs

# Detener
npm run docker:down
```

---

## 8. Estructura de archivos locales

Cuando el bot corre, crea estos archivos en la carpeta `data/`:

```
data/
  utp.db              <- Base de datos SQLite (cursos, clases, actividades)
  storage-state.json  <- Sesion de login guardada (no tenes que loguearte cada vez)
  screenshots/        <- Capturas de pantalla si hay errores de scraping
```

Estos archivos estan en `.gitignore` y no se suben al repositorio.

---

## 9. Comandos utiles

| Comando | Que hace |
|---|---|
| `npm run dev` | Inicia con hot reload |
| `npm run build` | Compila a JavaScript |
| `npm start` | Ejecuta el build compilado |
| `npm run scrape` | Ejecuta un scrape manual unico (sin iniciar el bot) |
| `npm run lint` | Verifica errores de TypeScript |
| `npm run db:studio` | Abre interfaz visual de la base de datos |

---

## 10. Troubleshooting

### "browserType.launch: Executable doesn't exist"

Playwright no encontro Chromium. Ejecuta:
```bash
npx playwright install chromium
```

### "SQLITE_IOERR" o errores de base de datos

Elimina la base de datos y reinicia:
```bash
rm -f data/utp.db data/utp.db-wal data/utp.db-shm
npm run dev
```

### El scrape falla con "Login verification failed"

Tus credenciales pueden estar mal. Verifica entrando manualmente en https://class.utp.edu.pe con tu codigo y contrasena.

Si las credenciales son correctas pero sigue fallando, elimina la sesion guardada:
```bash
rm -f data/storage-state.json
```

### El bot no responde en Telegram

1. Verifica que el proceso esta corriendo (`npm run dev` muestra logs).
2. Verifica que `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` son correctos.
3. Asegurate de haber enviado `/start` al bot al menos una vez.

### Playwright pide dependencias del sistema (Linux)

```bash
sudo npx playwright install-deps chromium
```

En Arch Linux / Manjaro puede que necesites instalar paquetes manualmente:
```bash
sudo pacman -S nss atk cups libxkbcommon libxcomposite libxdamage libxrandr mesa pango alsa-lib
```
