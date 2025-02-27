// killstreak.js
const { COMBAT_EMOJIS, SYSTEM_EMOJIS } = require('./emojis');
const util = require('./util');

// Constants
const KILL_STREAK_TIMEOUT = 18000; // 18 seconds in milliseconds

const KILL_STREAK_TYPES = {
    2: `DOUBLE KILL ${COMBAT_EMOJIS.KILL}${COMBAT_EMOJIS.KILL}`,
    3: `TRIPLE KILL ${COMBAT_EMOJIS.KILL}${COMBAT_EMOJIS.KILL}${COMBAT_EMOJIS.KILL}`,
    4: `ULTRA KILL ${COMBAT_EMOJIS.KILL}${COMBAT_EMOJIS.KILL}${COMBAT_EMOJIS.KILL}${COMBAT_EMOJIS.KILL}`,
    5: `RAMPAGE ${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}`
};

const KILLING_SPREE_TYPES = {
    3: `KILLING SPREE ${COMBAT_EMOJIS.SPREE}`,
    4: `DOMINATING ${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}`,
    5: `MEGA KILL ${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}`,
    6: `UNSTOPPABLE ${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}`,
    7: `WICKED SICK ${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}`,
    8: `MONSTER KILL ${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}`,
    9: `GODLIKE ${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}`,
    10: `BEYOND GODLIKE ${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}`
};

// Game state constants
const GAME_STATES = {
    INIT: 'DOTA_GAMERULES_STATE_INIT',
    LOADING: 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD',
    HERO_SELECTION: 'DOTA_GAMERULES_STATE_HERO_SELECTION',
    IN_PROGRESS: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS'
};

class KillStreak {
    constructor(logger, obsService) {
        this.logger = logger;
        this.obsService = obsService;

        // Initialize game state tracking
        this.previousGameState = {
            player: {
                kills: 0,
                deaths: 0,
                assists: 0
            }
        };

        this.killStreakData = {
            kills: 0,
            lastKillTime: 0,
            streakType: null,
            killsWithoutDying: 0,
            spreeLevel: 0,
            firstBloodClaimed: false
        };

        this.resetShown = false;
    }

    /**
     * Main method to process the current game state
     * @param {Object} currentGameState - The current game state
     */
    async processGameState(currentGameState) {
        // Early returns for invalid game states
        if (this.shouldResetTracking(currentGameState)) {
            this.resetTracking();
            return;
        }

        if (!this.isValidGameState(currentGameState)) {
            return;
        }

        // Extract game state data
        const gameData = this.extractGameStateData(currentGameState);

        // Process various events
        this.processFirstBlood(gameData);
        this.processAssists(gameData);
        this.processDeaths(gameData);
        await this.processKills(gameData, currentGameState);
        this.handleKillStreakExpiration(gameData);

        // Update previous state
        this.previousGameState = currentGameState;
    }

    /**
     * Check if tracking should be reset (new game)
     */
    shouldResetTracking(currentGameState) {
        return !this.resetShown &&
            currentGameState &&
            currentGameState.map &&
            [
                GAME_STATES.INIT,
                GAME_STATES.LOADING,
                GAME_STATES.HERO_SELECTION
            ].includes(currentGameState.map.game_state);

    }

    /**
     * Reset all tracking data for a new game
     */
    resetTracking() {
        this.killStreakData = {
            kills: 0,
            lastKillTime: 0,
            streakType: null,
            killsWithoutDying: 0,
            spreeLevel: 0,
            firstBloodClaimed: false
        };
        util.logMessage('Game reset - tracking reinitialized', SYSTEM_EMOJIS.INFO);
        this.resetShown = true;
    }

    /**
     * Check if the current game state is valid for processing
     */
    isValidGameState(currentGameState) {
        return currentGameState &&
            currentGameState.player &&
            currentGameState.map &&
            currentGameState.map.game_state === GAME_STATES.IN_PROGRESS;
    }

    /**
     * Extract relevant data from the game state
     */
    extractGameStateData(currentGameState) {
        const previousState = this.previousGameState;

        return {
            currentKills: currentGameState.player?.kills || 0,
            previousKills: previousState.player?.kills || 0,
            currentDeaths: currentGameState.player?.deaths || 0,
            previousDeaths: previousState.player?.deaths || 0,
            currentAssists: currentGameState.player?.assists || 0,
            previousAssists: previousState.player?.assists || 0,
            currentGameTime: (currentGameState.map?.game_time || 0) * 1000,
            playerTeam: currentGameState.player?.team_name || '',
            currentRadiantScore: currentGameState.map?.radiant_score || 0,
            currentDireScore: currentGameState.map?.dire_score || 0,
            previousRadiantScore: previousState.map?.radiant_score || 0,
            previousDireScore: previousState.map?.dire_score || 0,
            playerGotKill: (currentGameState.player?.kills || 0) > (previousState.player?.kills || 0),
            killsGained: (currentGameState.player?.kills || 0) - (previousState.player?.kills || 0),
            matchId: currentGameState.map?.matchid
        };
    }

    /**
     * Process first blood events
     */
    processFirstBlood(gameData) {
        if (this.killStreakData.firstBloodClaimed) {
            return;
        }

        // Check for first team kill
        const firstTeamKill = (gameData.previousRadiantScore === 0 && gameData.currentRadiantScore > 0) ||
            (gameData.previousDireScore === 0 && gameData.currentDireScore > 0);

        // Check for first global kill
        const firstGlobalKill = gameData.previousRadiantScore + gameData.previousDireScore === 0 &&
            gameData.currentRadiantScore + gameData.currentDireScore === 1;

        if (!(firstTeamKill || firstGlobalKill)) {
            return;
        }

        this.killStreakData.firstBloodClaimed = true;

        // Player got first blood
        if (gameData.playerGotKill) {
            util.logMessage(`YOU GOT FIRST BLOOD! ${COMBAT_EMOJIS.KILL}`, COMBAT_EMOJIS.KILL);
            return;
        }

        // Player's team got first blood
        const playerOnRadiant = gameData.playerTeam.toLowerCase() === 'radiant';
        const radiantGotKill = gameData.currentRadiantScore > gameData.previousRadiantScore;

        if ((playerOnRadiant && radiantGotKill) || (!playerOnRadiant && !radiantGotKill)) {
            util.logMessage(`YOUR TEAM GOT FIRST BLOOD! ${COMBAT_EMOJIS.KILL}`, COMBAT_EMOJIS.KILL);
        } else {
            util.logMessage(`ENEMY TEAM GOT FIRST BLOOD ${COMBAT_EMOJIS.DEATH}`, COMBAT_EMOJIS.DEATH);
        }
    }

    /**
     * Process player assists
     */
    processAssists(gameData) {
        if (gameData.currentAssists > gameData.previousAssists) {
            const assistsGained = gameData.currentAssists - gameData.previousAssists;
            util.logMessage(
                `Player got ${assistsGained} new assist(s)! Total assists: ${gameData.currentAssists} ${COMBAT_EMOJIS.ASSIST}`,
                COMBAT_EMOJIS.ASSIST
            );
        }
    }

    /**
     * Process player deaths
     */
    processDeaths(gameData) {
        if (gameData.currentDeaths <= gameData.previousDeaths) {
            return;
        }

        util.logMessage(`Player died ${COMBAT_EMOJIS.DEATH}`, COMBAT_EMOJIS.DEATH);

        // Reset killing spree on death
        if (this.killStreakData.killsWithoutDying >= 3) {
            util.logMessage(
                `KILLING SPREE ENDED ${COMBAT_EMOJIS.DEATH} (${this.killStreakData.killsWithoutDying} kills)`,
                COMBAT_EMOJIS.DEATH
            );
        }

        this.killStreakData.killsWithoutDying = 0;
        this.killStreakData.spreeLevel = 0;
    }

    /**
     * Process player kills
     */
    async processKills(gameData, currentGameState) {
        if (!gameData.playerGotKill) {
            return;
        }

        // Increment kills without dying counter
        this.killStreakData.killsWithoutDying += gameData.killsGained;

        // Check for killing spree milestones
        this.checkKillingSpree();

        // Basic kill message
        util.logMessage(
            `Player got ${gameData.killsGained} new kill(s)! Total kills: ${gameData.currentKills} ${COMBAT_EMOJIS.KILL}`,
            COMBAT_EMOJIS.KILL
        );

        // Check for kill streak (double kill, triple kill, etc.)
        await this.checkMultiKill(gameData, currentGameState);
    }

    /**
     * Check for killing spree milestones
     */
    checkKillingSpree() {
        const killsWithoutDying = this.killStreakData.killsWithoutDying;
        const spreeLevel = this.killStreakData.spreeLevel;

        if (KILLING_SPREE_TYPES[killsWithoutDying] && spreeLevel < killsWithoutDying) {
            const spreeMessage = KILLING_SPREE_TYPES[killsWithoutDying];
            util.logMessage(spreeMessage, COMBAT_EMOJIS.SPREE);
            this.killStreakData.spreeLevel = killsWithoutDying;
            // You could play a sound here based on the spree level
            // playSound(`${spreeMessage.toLowerCase().replace(/ /g, '_')}.mp3`);
        }
    }

    /**
     * Check for multi-kill streaks
     */
    async checkMultiKill(gameData, currentGameState) {
        const timeSinceLastKill = gameData.currentGameTime - this.killStreakData.lastKillTime;

        if (timeSinceLastKill <= KILL_STREAK_TIMEOUT) {
            this.killStreakData.kills += gameData.killsGained;

            // Determine streak type
            if (this.killStreakData.kills >= 2 && KILL_STREAK_TYPES[this.killStreakData.kills]) {
                this.killStreakData.streakType = KILL_STREAK_TYPES[this.killStreakData.kills];
                util.logMessage(this.killStreakData.streakType, COMBAT_EMOJIS.SPREE);

                // Save the replay if appropriate
                try {
                    await this.obsService.saveReplay({
                        matchId: gameData.matchId,
                        eventType: 'multikill',
                        enemyName: 'multiple'
                    });
                } catch (error) {
                    this.logger.error('Failed to save replay', {
                        error: error.message
                    });
                }
            }
        } else {
            this.killStreakData.kills = gameData.killsGained;
            this.killStreakData.streakType = null;
        }

        this.killStreakData.lastKillTime = gameData.currentGameTime;
    }

    /**
     * Handle kill streak expiration
     */
    handleKillStreakExpiration(gameData) {
        const timeSinceLastKill = gameData.currentGameTime - this.killStreakData.lastKillTime;

        if (this.killStreakData.kills > 0 && timeSinceLastKill > KILL_STREAK_TIMEOUT) {
            // Reset kill streak if timeout has passed
            this.killStreakData.kills = 0;
            this.killStreakData.streakType = null;
        }
    }
}

module.exports = KillStreak;