import winston from 'winston';
import config from '../config.js';

const { combine, timestamp, json, errors, printf, colorize } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  if (stack) {
    msg += `\n${stack}`;
  }
  return msg;
});

const logger = winston.createLogger({
  level: config.logging.level,
  defaultMeta: { service: 'liquidation-arena' },
  transports: [
    new winston.transports.Console({
      format: combine(
        timestamp(),
        config.server.env === 'development' ? colorize() : winston.format.uncolorize(),
        config.server.env === 'development' ? devFormat : json(),
        errors({ stack: true })
      ),
    }),
  ],
});

export default logger;
