// logger.js
const winston = require('winston');
const fs = require('fs');
const path = require('path');

function createLogger(config) {
    // Ensure logging directory exists first
    if (!fs.existsSync(config.logging.directory)) {
        fs.mkdirSync(config.logging.directory, { recursive: true });
    }

    // Create the logger instance
    const logger = winston.createLogger({
        level: config.logging.level,
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.File({
                filename: path.join(config.logging.directory, 'error.log'),
                level: 'error'
            }),
            new winston.transports.File({
                filename: path.join(config.logging.directory, 'combined.log')
            }),
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            })
        ]
    });

    // Add a startup message
    logger.info('Logger initialized', {
        level: config.logging.level,
        directory: config.logging.directory
    });

    return logger;
}

module.exports = createLogger;