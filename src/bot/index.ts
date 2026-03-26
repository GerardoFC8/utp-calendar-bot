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
    { command: 'hoy', description: 'Clases y tareas de hoy' },
    { command: 'manana', description: 'Clases y tareas de manana' },
    { command: 'semana', description: 'Horario semanal' },
    { command: 'cursos', description: 'Cursos activos' },
    { command: 'tareas', description: 'Tareas pendientes' },
    { command: 'zoom', description: 'Links de Zoom' },
    { command: 'refresh', description: 'Ejecutar scrape inmediato' },
    { command: 'status', description: 'Estado del bot' },
    { command: 'help', description: 'Lista de comandos' },
  ]);

  // Start polling
  await botInstance.launch();
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
