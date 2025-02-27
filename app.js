// Required dependencies
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const config = require('./config');
const createLogger = require('./logger');
const OBSService = require('./obs-service');
const Mirana = require('./mirana');
const KillStreak = require('./killstreak');
const GameStateLogger = require('./gamestate-logger');

// Initialize required directories and create logger
function initializeApp() {
    // Create the logger first
    const logger = createLogger(config);

    // Initialize recordings directory (now we can log any issues)
    if (!fs.existsSync(config.obs.outputPath)) {
        logger.info('Creating recordings directory', { path: config.obs.outputPath });
        fs.mkdirSync(config.obs.outputPath, { recursive: true });
    }

    return logger;
}

// Create logger instance
const logger = initializeApp();
const gameStateLogger = new GameStateLogger(logger, config.logging.directory);

// Initialize OBS Service with our logger and config
const obsService = new OBSService(logger, config.obs);

// Create our trackers on startup
const miranaTracker = new Mirana(logger, obsService);
const killStreakTracker = new KillStreak(logger, obsService);

// Start the express application
const app = express();
app.use(bodyParser.json({ limit: '50mb' })); // spectator mode requires higher limit

/**
 * Main POST endpoint for receiving game state updates
 */
app.post('/', async (req, res) => {
    const gameState = req.body;
    gameStateLogger.logGameState(gameState);
    await killStreakTracker.processGameState(gameState)
    await miranaTracker.processGameState(gameState);
    res.sendStatus(200);
});

/**
 * Start the Express server
 */
function startServer() {
    return new Promise((resolve, reject) => {
        const server = app.listen(config.server.port, () => {
            logger.info('Dota 2 GSI Server started', {
                port: config.server.port,
                environment: process.env.NODE_ENV || 'development',
                logDirectory: config.logging.directory,
                obsConfig: {
                    ...config.obs,
                    password: '********' // Don't log the actual password
                }
            });
            resolve(server);
        });

        server.on('error', (error) => {
            logger.error('Failed to start server', {
                error: error.message,
                stack: error.stack
            });
            reject(error);
        });
    });
}

/**
 * Main application startup function
 */
async function startApplication() {
    try {
        logger.info('Starting Dota 2 GSI Service');

        // Connect to OBS
        await obsService.connect();

        // Start the HTTP server
        const server = await startServer();

        // Setup graceful shutdown
        process.on('SIGINT', async () => {
            logger.info('Graceful shutdown initiated');
            try {
                // Cleanup gamestate logger
                gameStateLogger.cleanup();

                // Close the HTTP server first
                await new Promise((resolve) => server.close(resolve));
                logger.info('HTTP server closed');

                // Then shutdown OBS connection
                await obsService.shutdown();

                // Exit successfully
                process.exit(0);
            } catch (error) {
                logger.error('Error during shutdown', {
                    error: error.message,
                    stack: error.stack
                });
                process.exit(1);
            }
        });

    } catch (error) {
        logger.error('Failed to start application', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
}

startApplication();