import { Telegraf } from 'telegraf';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { registerCommands, setRefreshCallback } from './commands.js';

let bot: Telegraf | null = null;

export function createBot(): Telegraf {
  bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

  // Error handling
  bot.catch((error, ctx) => {
    logger.error({ error, updateType: ctx.updateType }, 'Bot error');
  });

  // Register all commands
  registerCommands(bot);

  logger.info('Telegram bot created');
  return bot;
}

export function getBot(): Telegraf {
  if (!bot) {
    throw new Error('Bot not initialized. Call createBot() first.');
  }
  return bot;
}

export async function startBot(): Promise<Telegraf> {
  const botInstance = createBot();

  // Set bot commands menu
  await botInstance.telegram.setMyCommands([
    { command: 'hoy', description: 'Clases y actividades de hoy' },
    { command: 'manana', description: 'Clases y actividades de manana' },
    { command: 'semana', description: 'Horario semanal' },
    { command: 'resumen', description: 'Dashboard compacto del dia' },
    { command: 'cursos', description: 'Cursos activos' },
    { command: 'actividades', description: 'Actividades pendientes del mes' },
    { command: 'pendientes', description: 'Actividades urgentes (3 dias)' },
    { command: 'reporte', description: 'Exportar actividades como TXT' },
    { command: 'zoom', description: 'Links de Zoom' },
    { command: 'refresh', description: 'Ejecutar scrape inmediato' },
    { command: 'status', description: 'Estado del bot' },
    { command: 'help', description: 'Lista de comandos' },
  ]);

  // Start polling — if another instance is already running Telegram returns
  // 409 Conflict. In that case exit(0) so restart:always does NOT re-launch us
  // (restart only triggers on non-zero exit codes by default).
  try {
    await botInstance.launch();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('409')) {
      logger.warn('Another bot instance is already running (409 Conflict). Exiting cleanly — will not restart.');
      process.exit(0);
    }
    throw error;
  }

  logger.info('Telegram bot started');
  return botInstance;
}

export async function stopBot(): Promise<void> {
  if (bot) {
    bot.stop('SIGTERM');
    logger.info('Telegram bot stopped');
  }
}

export { setRefreshCallback };
