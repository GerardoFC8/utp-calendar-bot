import { config } from './config.js';
import { logger } from './logger.js';
import { initDatabase, closeDatabase } from './db/index.js';
import { startBot, stopBot, setRefreshCallback } from './bot/index.js';
import { startScheduler, executeScrape } from './scheduler/cron.js';

async function main(): Promise<void> {
  logger.info('UTP+ Calendar Bot starting...');

  // 1. Initialize database
  logger.info('Initializing database...');
  initDatabase();

  // 2. Set refresh callback BEFORE starting the bot
  setRefreshCallback(executeScrape);

  // 3. Start Telegram bot
  logger.info('Starting Telegram bot...');
  const bot = await startBot();

  // 4. Start scheduler
  logger.info('Starting scheduler...');
  startScheduler(bot);

  logger.info('UTP+ Calendar Bot is running');
  logger.info({
    scrapeCron: config.SCRAPE_CRON,
    morningCron: config.MORNING_REMINDER_CRON,
    reminderMinutes: config.CLASS_REMINDER_MINUTES,
    timezone: config.TZ,
  }, 'Configuration loaded');

  // 5. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await stopBot();
    closeDatabase();
    logger.info('Cleanup complete. Exiting.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
  });
}

main().catch((error) => {
  logger.fatal({ error }, 'Failed to start bot');
  process.exit(1);
});
