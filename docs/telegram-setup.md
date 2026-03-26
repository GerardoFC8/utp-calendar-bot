# Configuracion de credenciales de Telegram

Esta guia explica como obtener el `TELEGRAM_BOT_TOKEN` y el `TELEGRAM_CHAT_ID` necesarios para que el bot funcione.

---

## 1. Crear el bot con BotFather

1. Abre Telegram y busca el usuario **@BotFather** (tiene una marca de verificacion azul).
2. Inicia una conversacion y envia el comando:
   ```
   /newbot
   ```
3. BotFather te va a pedir un **nombre para el bot** (puede tener espacios, es el nombre visible). Ejemplo:
   ```
   Mi Calendario UTP
   ```
4. Luego te va a pedir un **username** (sin espacios, debe terminar en `bot`). Ejemplo:
   ```
   mi_calendario_utp_bot
   ```
5. Si el username esta disponible, BotFather te responde con el token. Se ve asi:
   ```
   123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

Ese valor es tu `TELEGRAM_BOT_TOKEN`. Guardalo.

---

## 2. Obtener el CHAT_ID

El `CHAT_ID` identifica la conversacion (o grupo) donde el bot va a enviar mensajes.

1. **Envia cualquier mensaje a tu bot recien creado.** Puede ser solo "hola". Este paso es obligatorio, si no el siguiente paso devuelve una lista vacia.

2. Abre este enlace en el navegador, reemplazando `<TU_TOKEN>` con el token real:
   ```
   https://api.telegram.org/bot<TU_TOKEN>/getUpdates
   ```
   Ejemplo con un token real:
   ```
   https://api.telegram.org/bot123456789:ABCdefGHIjklMNOpqrsTUVwxyz/getUpdates
   ```

3. La respuesta es un JSON. Buscas el campo `"chat"` y dentro de el el campo `"id"`:
   ```json
   {
     "ok": true,
     "result": [
       {
         "message": {
           "chat": {
             "id": 987654321,
             "first_name": "Juan",
             "type": "private"
           },
           "text": "hola"
         }
       }
     ]
   }
   ```
   El numero `987654321` es tu `TELEGRAM_CHAT_ID`.

> **Respuesta vacia?** Si ves `{"ok":true,"result":[]}`, es porque no le enviaste ningun mensaje al bot. Envialo un mensaje y vuelve a abrir el enlace.

---

## 3. Configurar el archivo .env

Con los dos valores obtenidos, tu archivo `.env` queda asi:

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=987654321
```

Reemplaza los valores de ejemplo con los tuyos reales.

---

## 4. Verificar que el bot funciona

Usa este comando `curl` para probar que el bot puede enviar mensajes. Reemplaza `<TU_TOKEN>` y `<TU_CHAT_ID>`:

```bash
curl "https://api.telegram.org/bot<TU_TOKEN>/sendMessage?chat_id=<TU_CHAT_ID>&text=Bot+configurado+correctamente"
```

Si recibes el mensaje "Bot configurado correctamente" en tu Telegram, todo esta listo.

---

## 5. Troubleshooting

| Problema | Causa probable | Solucion |
|---|---|---|
| `getUpdates` devuelve `result: []` | No le enviaste mensaje al bot | Envia cualquier mensaje al bot y repite el paso 2 |
| Error `401 Unauthorized` | El token esta mal copiado | Vuelve a BotFather, usa `/mybots`, selecciona tu bot y copia el token de nuevo |
| Error `chat not found` | El `CHAT_ID` esta incorrecto | Repite el paso de `getUpdates` y copia el `id` correctamente |
| El bot no responde en produccion | Las variables de entorno no estan cargadas | Verifica que el `.env` esta bien y que el proceso lo lee |

### Chat ID de un grupo

Si queres que el bot envie mensajes a un **grupo** en vez de un chat privado:

1. Agrega el bot al grupo.
2. Envia un mensaje en el grupo (cualquiera).
3. Repite el paso de `getUpdates`.
4. El `"id"` del grupo va a aparecer con valor negativo. Ejemplo: `-123456789`.

Usa ese numero negativo como `TELEGRAM_CHAT_ID` en el `.env`.
