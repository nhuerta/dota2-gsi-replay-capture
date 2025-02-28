// mirana.js
const { HERO_EMOJIS } = require('./emojis');
const util = require('./util');

// Mirana's ability names and their corresponding information
const MIRANA_ABILITIES = {
    'mirana_arrow': {
        name: 'Sacred Arrow',
        emoji: HERO_EMOJIS.ARROW,
        hasCharges: false
    },
    'mirana_starfall': {
        name: 'Starstorm',
        emoji: HERO_EMOJIS.STARFALL,
        hasCharges: false
    },
    'mirana_leap': {
        name: 'Leap',
        emoji: HERO_EMOJIS.LEAP,
        hasCharges: true
    },
    'mirana_invis': {
        name: 'Moonlight Shadow',
        emoji: HERO_EMOJIS.MOONLIGHT,
        hasCharges: false
    }
};

/**
 * Handles tracking of Mirana ability usage
 */
class AbilityTracker {
    constructor(logger) {
        this.logger = logger;
        this.previousAbilities = {};
    }

    /**
     * Update the previous abilities state
     * @param {Object} abilities - Current abilities state
     */
    updatePreviousState(abilities) {
        this.previousAbilities = { ...abilities };
    }

    /**
     * Detect if a charge-based ability was just cast
     * @param {Object} current - Current ability state
     * @param {Object} previous - Previous ability state
     * @returns {boolean} Whether the ability was just cast
     */
    wasChargeCast(current, previous) {
        if (!previous) return false;

        // Case 1: Charge cooldown was 0 and now is greater than 0
        if (previous.charge_cooldown === 0 && current.charge_cooldown > 0) {
            return true;
        }

        // Case 2: Number of charges decreased
        if (previous.charges > current.charges) {
            return true;
        }

        // Case 3: Charges were at max and now they're not, with cooldown active
        return previous.charges === previous.max_charges &&
            current.charges < current.max_charges &&
            current.charge_cooldown > 0;


    }

    /**
     * Detect if a regular ability was just cast
     * @param {Object} current - Current ability state
     * @param {Object} previous - Previous ability state
     * @returns {boolean} Whether the ability was just cast
     */
    wasRegularCast(current, previous) {
        if (!previous) return false;

        // Cooldown wasn't active and now it is
        if (current.cooldown > 0 && previous.cooldown === 0) {
            return true;
        }

        // Could cast before but can't now and cooldown is active
        if (previous.can_cast === true &&
            current.can_cast === false &&
            current.cooldown > 0) {
            return true;
        }

        return false;
    }

    /**
     * Check if an ability was just cast
     * @param {Object} current - Current ability state
     * @param {Object} previous - Previous ability state
     * @param {string} abilityName - Name of the ability
     * @returns {boolean} Whether the ability was just cast
     */
    wasAbilityCast(current, previous, abilityName) {
        if (!current || !previous) return false;

        const ability = MIRANA_ABILITIES[abilityName];
        if (!ability) return false;

        return ability.hasCharges
            ? this.wasChargeCast(current, previous)
            : this.wasRegularCast(current, previous);
    }

    /**
     * Track Mirana's ability usage
     * @param {Object} currentAbilities - Current abilities state
     * @returns {Array} Array of abilities that were just cast
     */
    trackAbilities(currentAbilities) {
        if (!currentAbilities) return [];

        const castAbilities = [];

        Object.entries(currentAbilities).forEach(([key, ability]) => {
            const abilityName = ability.name;
            if (!MIRANA_ABILITIES[abilityName]) return;

            const prevAbility = this.previousAbilities[key];
            if (!prevAbility) return;

            if (this.wasAbilityCast(ability, prevAbility, abilityName)) {
                const abilityInfo = MIRANA_ABILITIES[abilityName];

                util.logMessage(
                    `${HERO_EMOJIS.MIRANA} Mirana cast ${abilityInfo.name}!`,
                    abilityInfo.emoji
                );

                castAbilities.push({
                    name: abilityName,
                    info: abilityInfo
                });
            }
        });

        this.updatePreviousState(currentAbilities);
        return castAbilities;
    }
}

/**
 * Handles detection of Sacred Arrow hits
 */
class ArrowHitDetector {
    constructor(logger, obsService) {
        this.logger = logger;
        this.obsService = obsService;
        this.lastArrowCooldown = false;
        this.lastCastTime = 0;
        this.lastEnemyStates = new Map();
        // Maximum time an arrow travels before disappearing
        this.ARROW_MAX_TRAVEL_TIME = 3;
        // Minimum time before an arrow can hit a target
        this.ARROW_MIN_TRAVEL_TIME = 0.5;
        // Maximum arrow range
        this.ARROW_MAX_RANGE = 3000;
        // Maximum movement threshold for a stunned hero
        this.HIT_MOVEMENT_THRESHOLD = 10;
    }

    /**
     * Finds Sacred Arrow ability in the game state
     * @param {Object} gameState - Current game state
     * @returns {Object|null} Arrow ability or null if not found
     */
    findArrowAbility(gameState) {
        if (!gameState.abilities) return null;

        return Object.values(gameState.abilities)
            .find(ability => ability.name === "mirana_arrow");
    }

    /**
     * Checks if Sacred Arrow was just cast
     * @param {Object} arrow - Arrow ability state
     * @returns {boolean} Whether arrow was just cast
     */
    wasArrowJustCast(arrow) {
        return arrow.cooldown > 0 && !this.lastArrowCooldown;
    }

    /**
     * Get enemy heroes from minimap
     * @param {Object} gameState - Current game state
     * @returns {Array} Array of enemy heroes
     */
    getEnemiesFromMinimap(gameState) {
        return util.getEnemiesFromMinimap(gameState);
    }

    /**
     * Records enemy positions at arrow cast time
     * @param {Object} gameState - Current game state
     * @param {number} gameTime - Current game time
     */
    recordEnemyPositions(gameState, gameTime) {
        const enemies = this.getEnemiesFromMinimap(gameState);

        enemies.forEach(enemy => {
            this.lastEnemyStates.set(enemy.name, {
                time: gameTime,
                health: 100,
                position: {
                    x: enemy.xpos,
                    y: enemy.ypos
                }
            });
        });
    }

    /**
     * Handle arrow cast detection
     * @param {Object} gameState - Current game state
     * @param {number} gameTime - Current game time
     */
    handleArrowCast(gameState, gameTime) {
        this.lastCastTime = gameTime;
        this.recordEnemyPositions(gameState, gameTime);
        //util.logMessage(`${HERO_EMOJIS.MIRANA} Sacred Arrow launched!`, HERO_EMOJIS.ARROW);
    }

    /**
     * Calculate distance between two points
     * @param {Object} point1 - First point {x, y}
     * @param {Object} point2 - Second point {x, y}
     * @returns {number} Distance between points
     */
    calculateDistance(point1, point2) {
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Check if enemy is within arrow range
     * @param {Object} miranaPos - Mirana's position {x, y}
     * @param {Object} enemyPos - Enemy's position {x, y}
     * @returns {boolean} Whether enemy is in range
     */
    isWithinArrowRange(miranaPos, enemyPos) {
        return this.calculateDistance(miranaPos, enemyPos) <= this.ARROW_MAX_RANGE;
    }

    /**
     * Calculate how far an enemy has moved
     * @param {Object} currentPos - Current position
     * @param {Object} lastPos - Last recorded position
     * @returns {number} Distance moved
     */
    calculateMovementDistance(currentPos, lastPos) {
        return this.calculateDistance(currentPos, lastPos);
    }

    /**
     * Check if timing is right for a potential arrow hit
     * @param {number} currentTime - Current game time
     * @returns {boolean} Whether timing is valid for a hit
     */
    isValidHitTiming(currentTime) {
        const timeSinceCast = currentTime - this.lastCastTime;
        return timeSinceCast >= this.ARROW_MIN_TRAVEL_TIME &&
            timeSinceCast <= this.ARROW_MAX_TRAVEL_TIME;
    }

    /**
     * Check if enemy movement pattern suggests an arrow hit
     * @param {Object} enemy - Enemy data
     * @param {Object} lastState - Previously recorded enemy state
     * @param {Object} gameState - Current game state
     * @param {number} gameTime - Current game time
     * @returns {boolean} Whether a hit is detected
     */
    isPotentialHit(enemy, lastState, gameState, gameTime) {
        if (!lastState || !gameState.hero) return false;

        const currentPos = { x: enemy.xpos, y: enemy.ypos };
        const distMoved = this.calculateMovementDistance(currentPos, lastState.position);

        const miranaPos = { x: gameState.hero.xpos, y: gameState.hero.ypos };
        const isInRange = this.isWithinArrowRange(miranaPos, currentPos);

        return isInRange &&
            distMoved < this.HIT_MOVEMENT_THRESHOLD &&
            this.isValidHitTiming(gameTime);
    }

    /**
     * Create data object for arrow hit event
     * @param {Object} enemy - Enemy data
     * @param {number} gameTime - Current game time
     * @param {number} distMoved - Distance enemy moved
     * @param {string|number} matchId - Current match ID
     * @returns {Object} Arrow hit data
     */
    createArrowHitData(enemy, gameTime, distMoved, matchId) {
        return {
            matchId: matchId || 'unknown',
            eventType: 'arrow_hit',
            enemyName: enemy.name,
            gameTime,
            timeSinceCast: gameTime - this.lastCastTime,
            distanceMoved: distMoved,
            position: { x: enemy.xpos, y: enemy.ypos }
        };
    }

    /**
     * Save replay when arrow hit is detected
     * @param {Object} enemy - Enemy data
     * @param {number} gameTime - Current game time
     * @param {Object} lastState - Last enemy state
     * @param {string|number} matchId - Current match ID
     */
    async saveArrowHitReplay(enemy, gameTime, lastState, matchId) {
        const distMoved = this.calculateMovementDistance(
            { x: enemy.xpos, y: enemy.ypos },
            lastState.position
        );

        const arrowData = this.createArrowHitData(enemy, gameTime, distMoved, matchId);

        util.logMessage(
            `${HERO_EMOJIS.MIRANA} Potential arrow hit detected. Enemy: \x1b[32m${
                util.sanitizeHeroName(arrowData.enemyName)
            }\x1b[0m`,
            HERO_EMOJIS.ARROW
        );

        try {
            await this.obsService.saveReplay(arrowData);
        } catch (error) {
            this.logger.error('Failed to save replay', {
                error: error.message,
                arrowData
            });
        }

        // Remove enemy from tracking after hit
        this.lastEnemyStates.delete(enemy.name);
    }

    /**
     * Update enemy state for continued tracking
     * @param {Object} enemy - Enemy data
     * @param {Object} lastState - Last enemy state
     * @param {number} gameTime - Current game time
     */
    updateEnemyState(enemy, lastState, gameTime) {
        this.lastEnemyStates.set(enemy.name, {
            time: gameTime,
            health: lastState.health,
            position: { x: enemy.xpos, y: enemy.ypos }
        });
    }

    /**
     * Process potential arrow hits
     * @param {Object} gameState - Current game state
     * @param {number} gameTime - Current game time
     */
    async detectArrowHits(gameState, gameTime) {
        // Clear tracking if arrow travel time has expired
        if (gameTime - this.lastCastTime > this.ARROW_MAX_TRAVEL_TIME) {
            this.lastEnemyStates.clear();
            return;
        }

        const enemies = this.getEnemiesFromMinimap(gameState);

        for (const enemy of enemies) {
            const lastState = this.lastEnemyStates.get(enemy.name);
            if (!lastState) continue;

            if (this.isPotentialHit(enemy, lastState, gameState, gameTime)) {
                await this.saveArrowHitReplay(enemy, gameTime, lastState, gameState.map?.matchid);
            } else {
                this.updateEnemyState(enemy, lastState, gameTime);
            }
        }
    }

    /**
     * Process arrow ability state
     * @param {Object} gameState - Current game state
     * @param {number} gameTime - Current game time
     */
    async processArrow(gameState, gameTime) {
        const arrow = this.findArrowAbility(gameState);
        if (!arrow) return;

        // Detect new arrow cast
        if (this.wasArrowJustCast(arrow)) {
            this.handleArrowCast(gameState, gameTime);
        }

        // Look for potential hits
        await this.detectArrowHits(gameState, gameTime);

        // Update state for next check
        this.lastArrowCooldown = arrow.cooldown > 0;
    }
}

/**
 * Main Mirana class that coordinates ability tracking and arrow hit detection
 */
class Mirana {
    constructor(logger, obsService) {
        this.logger = logger;
        this.obsService = obsService;

        // Initialize specialized handlers
        this.abilityTracker = new AbilityTracker(logger);
        this.arrowHitDetector = new ArrowHitDetector(logger, obsService);

        // Initialize state
        this.previousGameState = { abilities: {} };
        this.pickMiranaMessageShown = false;

        // Log initialization
        util.logMessage(
            `Mirana ability tracking enabled: ${HERO_EMOJIS.ARROW} ${HERO_EMOJIS.STARFALL} ${HERO_EMOJIS.LEAP} ${HERO_EMOJIS.MOONLIGHT}`,
            HERO_EMOJIS.MIRANA
        );
    }

    /**
     * Check if the hero is Mirana
     * @param {Object} gameState - Current game state
     * @returns {boolean} Whether the hero is Mirana
     */
    isMirana(gameState) {
        return gameState.hero?.name?.toLowerCase() === 'npc_dota_hero_mirana';
    }

    /**
     * Handle hero selection phase
     * @param {Object} gameState - Current game state
     */
    handleHeroSelection(gameState) {
        // Only show message once when Mirana is picked
        if (this.pickMiranaMessageShown) return;

        if (this.isMirana(gameState)) {
            util.logMessage(`Mirana selected! Good luck! ${HERO_EMOJIS.MIRANA}`, HERO_EMOJIS.MIRANA);
            this.pickMiranaMessageShown = true;
        }
    }

    /**
     * Check if game is in hero selection phase
     * @param {Object} gameState - Current game state
     * @returns {boolean} Whether game is in hero selection
     */
    isInHeroSelection(gameState) {
        const selectionStates = [
            'DOTA_GAMERULES_STATE_INIT',
            'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD',
            'DOTA_GAMERULES_STATE_HERO_SELECTION'
        ];

        return gameState.map && selectionStates.includes(gameState.map.game_state);
    }

    /**
     * Main method to process game state updates
     * @param {Object} gameState - Current game state
     */
    async processGameState(gameState) {
        if (!gameState) return;

        // Handle hero selection phase
        if (this.isInHeroSelection(gameState)) {
            this.handleHeroSelection(gameState);
            return;
        }

        // Only process further if playing as Mirana
        if (!this.isMirana(gameState)) return;

        const gameTime = gameState.map?.game_time || 0;

        // Track ability usage
        this.abilityTracker.trackAbilities(gameState.abilities);

        // Process arrow detection
        await this.arrowHitDetector.processArrow(gameState, gameTime);

        // Store game state for next comparison
        this.previousGameState = gameState;
    }
}

module.exports = Mirana;