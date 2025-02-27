// Default configuration values
module.exports = {
    obs: {
        // Default to localhost for development
        address: process.env.OBS_ADDRESS || 'ws://localhost:4455',
        password: process.env.OBS_PASSWORD,
        replayBufferSeconds: parseInt(process.env.OBS_REPLAY_BUFFER_SECONDS || '40'),
        sceneName: process.env.OBS_SCENE_NAME || 'Dota2',
        outputPath: process.env.OBS_OUTPUT_PATH || './recordings',
        enabled: process.env.OBS_ENABLED !== 'false'
    },
    server: {
        port: parseInt(process.env.PORT || '3000')
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        directory: process.env.LOG_DIRECTORY || './logs'
    }
};