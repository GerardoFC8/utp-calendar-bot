import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    error: pino.stdSerializers.err,
    err: pino.stdSerializers.err,
  },
});
