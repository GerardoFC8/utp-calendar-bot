import { z } from 'zod';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

const envSchema = z.object({
  // UTP+ Class
  UTP_USERNAME: z.string().min(1, { error: 'UTP_USERNAME is required' }),
  UTP_PASSWORD: z.string().min(1, { error: 'UTP_PASSWORD is required' }),
  UTP_BASE_URL: z.url().default('https://class.utp.edu.pe'),
  UTP_CALENDAR_PATH: z.string().default('/student/calendar'),
  UTP_COURSES_PATH: z.string().default('/student/courses'),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1, { error: 'TELEGRAM_BOT_TOKEN is required' }),
  TELEGRAM_CHAT_ID: z.string().min(1, { error: 'TELEGRAM_CHAT_ID is required' }),

  // Scheduler
  SCRAPE_CRON: z.string().default('0 */6 * * *'),
  MORNING_REMINDER_CRON: z.string().default('0 6 * * 1-6'),
  CLASS_REMINDER_MINUTES: z.coerce.number().default(30),

  // Database
  DATABASE_PATH: z.string().default('./data/utp.db'),

  // App
  TZ: z.string().default('America/Lima'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.enum(['production', 'development']).default('production'),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`\nConfiguration error. Missing or invalid environment variables:\n${errors}\n`);
    console.error('Copy .env.example to .env and fill in the required values.\n');
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof envSchema>;
