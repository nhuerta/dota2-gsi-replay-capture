// gamestate-logger.js
const fs = require('fs');
const path = require('path');

class GameStateLogger {
    constructor(logger, loggingDirectory) {
        this.logger = logger;
        this.loggingDirectory = loggingDirectory;
        this.currentMatchId = null;
        this.currentLogStream = null;
        this.currentFileSize = 0;
        this.currentSequence = 0;
        this.MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB in bytes
    }

    getNextSequenceNumber(matchId) {
        // Find the highest sequence number for existing files
        const files = fs.readdirSync(this.loggingDirectory);
        let maxSequence = -1;

        const regex = new RegExp(`match_${matchId}_([0-9]+)\\.json$`);
        files.forEach(file => {
            const match = file.match(regex);
            if (match) {
                const sequence = parseInt(match[1]);
                maxSequence = Math.max(maxSequence, sequence);
            }
        });

        return maxSequence + 1;
    }

    rotateLogFile(matchId) {
        if (this.currentLogStream) {
            this.currentLogStream.end();
        }

        this.currentSequence = this.getNextSequenceNumber(matchId);
        const logPath = path.join(
            this.loggingDirectory,
            `match_${matchId}_${this.currentSequence.toString().padStart(5, '0')}.json`
        );

        this.currentLogStream = fs.createWriteStream(logPath, { flags: 'a' });
        this.currentFileSize = 0;

        // Write opening bracket for the JSON array
        this.currentLogStream.write('[\n');
    }

    ensureMatchLogging(matchId) {
        if (matchId !== this.currentMatchId) {
            // Starting a new match, always rotate
            this.currentMatchId = matchId;
            this.logger.info(`Starting new match ID: ${matchId}`);
            this.rotateLogFile(matchId);
            return;
        }

        // Check if we need to rotate due to size
        if (this.currentFileSize >= this.MAX_FILE_SIZE) {
            // Close current file with array ending
            this.currentLogStream.write(']');
            this.rotateLogFile(matchId);
        }
    }

    logGameState(gameData) {
        const matchId = gameData.map?.matchid;
        if (!matchId) {
            this.logger.warn('Received game data without match ID');
            return;
        }

        this.ensureMatchLogging(matchId);

        // Add timestamp to the complete game state
        const dataToLog = {
            timestamp: new Date().toISOString(),
            ...gameData
        };

        // Prepare the JSON string with proper array formatting
        let jsonString = JSON.stringify(dataToLog, null, 2);

        // Add comma if not first item
        if (this.currentFileSize > 2) { // 2 accounts for the opening '[\n'
            jsonString = ',\n' + jsonString;
        }

        // Write the data and update size tracking
        this.currentLogStream.write(jsonString);
        this.currentFileSize += jsonString.length;
    }

    cleanup() {
        if (this.currentLogStream) {
            // Close the array before ending
            this.currentLogStream.write('\n]');
            this.currentLogStream.end();
        }
    }
}

module.exports = GameStateLogger;