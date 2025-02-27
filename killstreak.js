// killstreak.js
const {
    COMBAT_EMOJIS,
    SYSTEM_EMOJIS
} = require('./emojis');
const util = require('./util');

// Kill streak configurations
const KILL_STREAK_TIMEOUT = 18000; // 18 seconds in milliseconds
const FIRST_BLOOD_TIME_LIMIT = 5 * 60 * 1000; // 5 minutes in milliseconds

// Multikill streak messages (double kill, triple kill, etc.)
const KILL_STREAK_TYPES = {
    2: `DOUBLE KILL ${COMBAT_EMOJIS.KILL}${COMBAT_EMOJIS.KILL}`,
    3: `TRIPLE KILL ${COMBAT_EMOJIS.KILL}${COMBAT_EMOJIS.KILL}${COMBAT_EMOJIS.KILL}`,
    4: `ULTRA KILL ${COMBAT_EMOJIS.KILL}${COMBAT_EMOJIS.KILL}${COMBAT_EMOJIS.KILL}${COMBAT_EMOJIS.KILL}`,
    5: `RAMPAGE ${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}${COMBAT_EMOJIS.SPREE}`
};

// Killing spree messages (based on kills without dying)
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

class KillStreak {
    constructor(logger, obsService) {
        this.logger = logger;
        this.obsService = obsService;

        // Dummy initial gamestate
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

    async processGameState(currentGameState) {
        // Handle game resets or new games
        if (!this.resetShown && currentGameState && currentGameState.map &&
            (currentGameState.map.game_state === 'DOTA_GAMERULES_STATE_INIT' ||
                currentGameState.map.game_state === 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD' ||
                currentGameState.map.game_state === 'DOTA_GAMERULES_STATE_HERO_SELECTION')) {
            // Reset all tracking when game restarts
            this.killStreakData.kills = 0;
            this.killStreakData.lastKillTime = 0;
            this.killStreakData.streakType = null;
            this.killStreakData.killsWithoutDying = 0;
            this.killStreakData.spreeLevel = 0;
            this.killStreakData.firstBloodClaimed = false;
            util.logMessage('Game reset - tracking reinitialized', SYSTEM_EMOJIS.INFO);
            this.resetShown = true;
        }

        if (!currentGameState || !currentGameState.player || !currentGameState.map || currentGameState.map.game_state !== 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS') return;

        const currentKills = currentGameState.player.kills || 0;
        const previousKills = this.previousGameState.player.kills || 0;
        const currentDeaths = currentGameState.player.deaths || 0;
        const previousDeaths = this.previousGameState.player.deaths || 0;
        const currentGameTime = currentGameState.map.game_time * 1000;
        const currentAssists = currentGameState.player.assists || 0;
        const previousAssists = this.previousGameState.player.assists || 0;

        // Check for player assists
        if (currentAssists > previousAssists) {
            const assistsGained = currentAssists - previousAssists;
            util.logMessage(`Player got ${assistsGained} new assist(s)! Total assists: ${currentAssists} ${COMBAT_EMOJIS.ASSIST}`, COMBAT_EMOJIS.ASSIST);
        }

        // Check for player death
        if (currentDeaths > previousDeaths) {
            util.logMessage(`Player died ${COMBAT_EMOJIS.DEATH}`, COMBAT_EMOJIS.DEATH);
            // Reset killing spree on death
            if (this.killStreakData.killsWithoutDying >= 3) {
                util.logMessage(`KILLING SPREE ENDED ${COMBAT_EMOJIS.DEATH} (${this.killStreakData.killsWithoutDying} kills)`, COMBAT_EMOJIS.DEATH);
            }
            this.killStreakData.killsWithoutDying = 0;
            this.killStreakData.spreeLevel = 0;
        }

        // Detect if a kill happened since the last update
        if (currentKills > previousKills) {
            const killsGained = currentKills - previousKills;

            // Check for First Blood
            if (!this.killStreakData.firstBloodClaimed && currentKills > 0 && currentGameTime <= FIRST_BLOOD_TIME_LIMIT) {
                util.logMessage(`FIRST BLOOD ${COMBAT_EMOJIS.KILL}`, COMBAT_EMOJIS.KILL);
                this.killStreakData.firstBloodClaimed = true;
                // You could play a special sound here
                // playSound('first_blood.mp3');
            }

            // Increment kills without dying counter
            this.killStreakData.killsWithoutDying += killsGained;

            // Check for killing spree milestones
            if (KILLING_SPREE_TYPES[this.killStreakData.killsWithoutDying] &&
                this.killStreakData.spreeLevel < this.killStreakData.killsWithoutDying) {
                const spreeMessage = KILLING_SPREE_TYPES[this.killStreakData.killsWithoutDying];
                util.logMessage(spreeMessage, COMBAT_EMOJIS.SPREE);
                this.killStreakData.spreeLevel = this.killStreakData.killsWithoutDying;
                // You could play a sound here based on the spree level
                // playSound(`${spreeMessage.toLowerCase().replace(/ /g, '_')}.mp3`);
            }

            // Basic kill message
            util.logMessage(`Player got ${killsGained} new kill(s)! Total kills: ${currentKills} ${COMBAT_EMOJIS.KILL}`, COMBAT_EMOJIS.KILL);

            // Check for kill streak (double kill, triple kill, etc.)
            const timeSinceLastKill = currentGameTime - this.killStreakData.lastKillTime;
            if (timeSinceLastKill <= KILL_STREAK_TIMEOUT) {
                this.killStreakData.kills += killsGained;

                // Determine streak type
                if (this.killStreakData.kills >= 2 && KILL_STREAK_TYPES[this.killStreakData.kills]) {
                    this.killStreakData.streakType = KILL_STREAK_TYPES[this.killStreakData.kills];

                    util.logMessage(this.killStreakData.streakType, COMBAT_EMOJIS.SPREE);

                    // You can trigger additional actions here like playing sounds or notifications
                    // e.g., playSound(`${killStreakData.streakType.toLowerCase().replace(' ', '_')}.mp3`);
                    try {
                        await this.obsService.saveReplay({ matchId: currentGameState.map?.matchid, eventType:'multikill', enemyName:'multiple'});
                    } catch (error) {
                        this.logger.error('Failed to save replay', {
                            error: error.message
                        });
                    }
                }
            } else {
                this.killStreakData.kills = killsGained;
                this.killStreakData.streakType = null;
            }
            this.killStreakData.lastKillTime = currentGameTime;
        }

        // Handle kill streak expiration
        const timeSinceLastKill = currentGameTime - this.killStreakData.lastKillTime;
        if (this.killStreakData.kills > 0 && timeSinceLastKill > KILL_STREAK_TIMEOUT) {
            // Reset kill streak if timeout has passed
            this.killStreakData.kills = 0;
            this.killStreakData.streakType = null;
        }

        // Update previous state
        this.previousGameState = currentGameState;
    }
}
module.exports = KillStreak;