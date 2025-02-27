// obs-service.js
const OBSWebSocket = require('obs-websocket-js').default;
const path = require('path');
const fs = require('fs');
const util = require('./util');

class OBSService {
    constructor(logger, config) {
        this.logger = logger;
        this.config = {
            address: config.address || 'ws://localhost:4455',
            password: config.password,
            replayBufferSeconds: config.replayBufferSeconds || 40,
            outputPath: config.outputPath || path.join(process.cwd(), 'recordings'),
            sceneName: config.sceneName || 'Default',
            enabled: config.enabled !== false
        };

        if (!this.config.enabled) {
            this.logger.debug("OBS Service is disabled, not creating websocket connection");
            return;
        }

        this.obs = new OBSWebSocket();
        this.recordingInProgress = false;

        // Ensure recordings directory exists
        if (!fs.existsSync(this.config.outputPath)) {
            fs.mkdirSync(this.config.outputPath, { recursive: true });
        }
    }

    async connect() {
        if (!this.config.enabled) {
            this.logger.debug("OBS Service is disabled, not connecting");
            return;
        }
        try {
            this.logger.info('Connecting to OBS...');
            await this.obs.connect(this.config.address, this.config.password);
            this.logger.info('Connected to OBS WebSocket');

            const version = await this.obs.call('GetVersion');
            this.logger.info('OBS Version Information', { version });

            await this.setupRecording();
        } catch (error) {
            this.logger.error('Failed to connect to OBS', {
                error: error.message,
                stack: error.stack
            });
            throw error; // Propagate error to caller
        }
    }

    async setupRecording() {
        if (!this.config.enabled) {
            this.logger.debug("OBS Service is disabled, not setting up recording");
            return;
        }
        try {
            // Set current scene
            await this.obs.call('SetCurrentProgramScene', {
                sceneName: this.config.sceneName
            });

            // Stop any existing replay buffer
            try {
                await this.obs.call('StopReplayBuffer');
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (e) {
                // Ignore errors from stopping - it might not be running
            }

            // Start the replay buffer
            await this.obs.call('StartReplayBuffer');
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Verify the replay buffer status
            const status = await this.obs.call('GetReplayBufferStatus');

            if (!status.outputActive) {
                this.logger.error('Replay buffer failed to activate', { status });
                throw new Error('Replay buffer not active after startup');
            }

            this.logger.info('OBS recording setup completed successfully', {
                scene: this.config.sceneName,
                replayBuffer: this.config.replayBufferSeconds,
                replayStatus: status
            });
        } catch (error) {
            this.logger.error('Failed to setup OBS recording', {
                error: error.message,
                stack: error.stack,
                sceneName: this.config.sceneName
            });
            throw error;
        }
    }

    async saveReplay(metadata) {
        if (!this.config.enabled) {
            this.logger.debug("OBS Service is disabled, not saving replay");
            return;
        }
        if (this.recordingInProgress) return;

        try {
            this.recordingInProgress = true;

            const timestamp = new Date();
            const formattedDate = timestamp.toISOString()
                .replace(/[T:]/g, '-')
                .split('.')[0];

            // Generate a descriptive filename that includes match ID and enemy name
            const matchId = metadata.matchId || 'unknown_match';
            const eventType = metadata.eventType || 'unknown_event';
            const sanitizedMatchId = matchId.toString().replace(/[^a-zA-Z0-9-]/g, '');
            const sanitizedEnemyName = util.sanitizeHeroName(metadata.enemyName);

            // Create filename in format: matchId_eventType_enemyName_timestamp.mkv
            const filename = `${sanitizedMatchId}_${eventType}_${sanitizedEnemyName}_${formattedDate}.mkv`;

            // Create a promise that will resolve when the replay save is complete
            const replaySavePromise = new Promise((resolve, reject) => {
                // Set up a timeout for safety (30 seconds max to save replay)
                const timeoutId = setTimeout(() => {
                    this.obs.removeListener('ReplayBufferSaved');
                    reject(new Error('Replay buffer save timed out after 30 seconds'));
                }, 30000);

                // Set up the event listener for when replay buffer save completes
                const savedHandler = (data) => {
                    clearTimeout(timeoutId);
                    resolve(data);
                };

                // Listen for the ReplayBufferSaved event
                this.obs.on('ReplayBufferSaved', savedHandler);

                // Also handle potential OBS errors
                const errorHandler = (err) => {
                    clearTimeout(timeoutId);
                    this.obs.removeListener('ReplayBufferSaved', savedHandler);
                    reject(err);
                };

                this.obs.on('error', errorHandler);

                // Add cleanup for these specific handlers
                this.replaySaveCleanup = () => {
                    this.obs.removeListener('ReplayBufferSaved', savedHandler);
                    this.obs.removeListener('error', errorHandler);
                    clearTimeout(timeoutId);
                };
            });

            // Trigger the replay buffer save with our custom filename
            await this.obs.call('SaveReplayBuffer', {
                filename: filename
            });

            // Wait for the save operation to complete via the event
            const replayData = await replaySavePromise;

            // Clean up event listeners
            if (this.replaySaveCleanup) {
                this.replaySaveCleanup();
                this.replaySaveCleanup = null;
            }

            // Get the saved path from the event data
            const originalPath = replayData.savedReplayPath;

            // Ensure target directory exists
            await fs.promises.mkdir(this.config.outputPath, { recursive: true });

            // Destination path where we'll copy the file
            const destinationPath = path.join(this.config.outputPath, filename);

            // Copy the replay file to our managed directory
            await fs.promises.copyFile(originalPath, destinationPath);

            this.logger.info('Saved and copied replay buffer', {
                metadata,
                originalPath,
                managedPath: destinationPath,
                timestamp: formattedDate
            });

            return destinationPath;

        } catch (error) {
            // Clean up any event listeners if an error occurred
            if (this.replaySaveCleanup) {
                this.replaySaveCleanup();
                this.replaySaveCleanup = null;
            }

            this.logger.error('Failed to save replay buffer', {
                error: error.message,
                stack: error.stack,
                metadata
            });
            throw error;
        } finally {
            // Clear the recording flag immediately
            this.recordingInProgress = false;
        }
    }

    async shutdown() {
        if (!this.config.enabled) return;
        try {
            await this.obs.call('StopReplayBuffer');
            await this.obs.disconnect();
            this.logger.info('OBS connection closed');
        } catch (error) {
            this.logger.error('Error during OBS shutdown', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
}

module.exports = OBSService;