import { logger } from '../src/logger.js';
import { initDatabase } from '../src/db/index.js';
import { executeScrape } from '../src/scheduler/cron.js';

async function main(): Promise<void> {
  logger.info('Running one-time scrape...');

  initDatabase();

  try {
    const result = await executeScrape();

    logger.info({
      courses: result.coursesFound,
      classes: result.classesFound,
      tasks: result.tasksFound,
      changes: result.changesDetected,
      duration: `${(result.duration / 1000).toFixed(1)}s`,
    }, 'Scrape completed');

    console.log('\nResults:');
    console.log(`  Courses found: ${result.coursesFound}`);
    console.log(`  Classes found: ${result.classesFound}`);
    console.log(`  Tasks found: ${result.tasksFound}`);
    console.log(`  Changes detected: ${result.changesDetected}`);
    console.log(`  Duration: ${(result.duration / 1000).toFixed(1)}s`);
  } catch (error) {
    logger.error({ error }, 'Scrape failed');
    process.exit(1);
  }

  process.exit(0);
}

main();
