const { SYSTEM_EMOJIS, COMBAT_EMOJIS } = require('./emojis');
const util = require('./util');

class Enemy {
    constructor() {
        this.enemyHeroes = {};           // Known enemy heroes
        this.victimIdToHero = {};        // Maps victim IDs to hero names
        this.heroToVictimId = {};        // Reverse mapping
        this.previousKillList = {};      // Previous kill counts
        this.previousMinimap = null;     // Previous minimap state
        this.mappingConfidence = {};     // Confidence scores (0-1)
        this.killTimestamps = {};        // When kills were detected
        this.lastReportTime = 0;         // For periodic reporting
        this.lockedMappings = new Set()  // NEW: Track locked high-confidence mappings
    }

    lockHighConfidenceMappings(victimId) {
        // If confidence reaches threshold, lock this mapping
        if (this.mappingConfidence[victimId] >= 0.85) {
            this.lockedMappings.add(victimId);
            util.logMessage(
                `Locked mapping: VictimID ${victimId} is ${this.formatHeroName(this.victimIdToHero[victimId])} (high confidence)`,
                SYSTEM_EMOJIS.INFO
            );
        }
    }

    updateEnemies(gameState) {
        // Update our catalog of known enemy heroes
        this.trackVisibleEnemies(gameState);

        // Detect new kills that occurred since last update
        const newKills = this.detectNewKills(gameState);

        // Identify which enemies disappeared from the minimap
        const disappearedEnemies = this.detectDisappearedEnemies(gameState);

        // Ensure every new victim ID has an initial mapping
        this.ensureInitialMapping(newKills);

        // Map disappeared enemies to victim IDs when both occur together
        if (newKills.length > 0 && disappearedEnemies.length > 0) {
            this.correlateKillsWithDisappearances(newKills, disappearedEnemies, gameState);
        }

        // Log identified kills with appropriate confidence indicators
        this.reportKills(newKills);

        // Periodically report kill summary (every 60 game seconds)
        const currentTime = gameState.map?.game_time || 0;
        if (currentTime - this.lastReportTime >= 60) {
            this.reportKillSummary();
            this.lastReportTime = currentTime;
        }

        // Store current state for next comparison
        this.updatePreviousState(gameState);
    }

    ensureInitialMapping(newKills) {
        // Skip if we haven't found any enemies yet
        if (Object.keys(this.enemyHeroes).length === 0) return;

        // Process each new kill
        newKills.forEach(kill => {
            // Only handle unmapped victim IDs
            if (this.victimIdToHero[kill.victimId]) return;

            // Find unmapped enemy heroes
            const mappedHeroes = new Set(Object.values(this.victimIdToHero));
            const unmappedHeroes = Object.keys(this.enemyHeroes).filter(
                heroName => !mappedHeroes.has(heroName)
            );

            let assignedHero = null;

            if (unmappedHeroes.length > 0) {
                // Assign to a random unmapped hero
                const randomIndex = Math.floor(Math.random() * unmappedHeroes.length);
                assignedHero = unmappedHeroes[randomIndex];
            } else {
                // All heroes are mapped, find one with lowest confidence
                let lowestConfidence = 1.0;
                let lowestConfidenceHero = null;

                Object.entries(this.heroToVictimId).forEach(([heroName, vid]) => {
                    const confidence = this.mappingConfidence[vid] || 0;
                    if (confidence < lowestConfidence) {
                        lowestConfidence = confidence;
                        lowestConfidenceHero = heroName;
                    }
                });

                // Reassign the hero with lowest confidence mapping
                if (lowestConfidenceHero) {
                    // Get the current victim ID for this hero
                    const currentVictimId = this.heroToVictimId[lowestConfidenceHero];

                    // Remove the old mapping
                    delete this.victimIdToHero[currentVictimId];

                    assignedHero = lowestConfidenceHero;
                } else {
                    // Fallback - use the first hero in our list
                    assignedHero = Object.keys(this.enemyHeroes)[0];
                }
            }

            // Create the new mapping with low confidence
            if (assignedHero) {
                this.victimIdToHero[kill.victimId] = assignedHero;
                this.heroToVictimId[assignedHero] = kill.victimId;
                this.mappingConfidence[kill.victimId] = 0.1; // Low initial confidence

                util.logMessage(
                    `Initial mapping: VictimID ${kill.victimId} to ${this.formatHeroName(assignedHero)} (10% confidence)`,
                    SYSTEM_EMOJIS.INFO
                );
            }
        });
    }

    correlateKillsWithDisappearances(newKills, disappearedEnemies, gameState) {
        // Get player position for proximity check
        const playerXPos = gameState.hero?.xpos;
        const playerYPos = gameState.hero?.ypos;
        const canCheckProximity = playerXPos !== undefined && playerYPos !== undefined;

        // Process ALL kills, not just unmapped ones
        newKills.forEach(kill => {
            let bestMatch = null;
            let bestScore = 0;

            // Get current mapping info if it exists
            const currentHeroName = this.victimIdToHero[kill.victimId];
            const currentConfidence = this.mappingConfidence[kill.victimId] || 0;

            // NEW: Skip if this mapping is locked
            if (this.lockedMappings.has(kill.victimId)) {
                // Still update confidence for confirmation, but don't change mapping
                if (bestMatch && bestMatch.name === currentHeroName) {
                    this.mappingConfidence[kill.victimId] = Math.min(
                        1.0,
                        currentConfidence + (bestScore * 0.1)
                    );
                }
                return; // Skip the rest of this iteration
            }

            // Only consider better scores than our current confidence
            // (this is key - we should be able to improve beyond initial 10%)
            const minScoreThreshold = Math.max(0.2, currentConfidence - 0.1);

            // Find the disappeared enemy with timing closest to the kill
            disappearedEnemies.forEach(enemy => {
                // Consider asymmetric time windows
                // Deaths typically happen slightly before kill notifications
                const timeScore = Math.max(0, 1 - (
                    enemy.timestamp < kill.timestamp ?
                        (kill.timestamp - enemy.timestamp) / 1.5 : // Before kill notification
                        (enemy.timestamp - kill.timestamp) / 0.5    // After kill notification
                ));

                // Calculate distance-based correlation score
                let proximityScore = 0;
                if (canCheckProximity && enemy.lastPosition) {
                    const distance = this.calculateDistance(
                        playerXPos, playerYPos,
                        enemy.lastPosition.x, enemy.lastPosition.y
                    );

                    // Higher score for closer enemies
                    proximityScore = Math.max(0, 1 - (distance / 1500));
                }

                // Combined score - weight time and proximity equally
                const combinedScore = canCheckProximity ?
                    (timeScore * 0.5) + (proximityScore * 0.5) :
                    timeScore;

                // Check if this is a better match
                if (combinedScore > bestScore && combinedScore > minScoreThreshold) {
                    bestScore = combinedScore;
                    bestMatch = enemy;
                }
            });

            // If we found a better match than our current confidence
            if (bestMatch) {
                // If this is a confirmation of existing mapping
                if (bestMatch.name === currentHeroName) {
                    // Increase confidence but cap at 1.0
                    this.mappingConfidence[kill.victimId] = Math.min(
                        1.0,
                        currentConfidence + (bestScore * 0.2)
                    );

                    const confidencePct = Math.round(this.mappingConfidence[kill.victimId] * 100);
                    util.logMessage(
                        `Confirmed: VictimID ${kill.victimId} is ${this.formatHeroName(bestMatch.name)} (${confidencePct}% confidence)`,
                        SYSTEM_EMOJIS.INFO
                    );
                    // NEW: Check if we should lock this mapping
                    this.lockHighConfidenceMappings(kill.victimId);
                }
                // This is a new hero assignment that's better than our current one
                else {
                    // If this hero is already mapped to a different victim
                    if (this.heroToVictimId[bestMatch.name]) {
                        // Only reassign if our new score is significantly better than existing
                        const otherVictimId = this.heroToVictimId[bestMatch.name];
                        // NEW: Also skip if the hero's current mapping is locked
                        if (this.lockedMappings.has(otherVictimId)) {
                            return; // Skip reassignment
                        }
                        const otherConfidence = this.mappingConfidence[otherVictimId] || 0;

                        if (bestScore > otherConfidence + 0.2) {
                            // Remove the old mapping
                            delete this.victimIdToHero[otherVictimId];

                            // Update with new mapping
                            this.victimIdToHero[kill.victimId] = bestMatch.name;
                            this.heroToVictimId[bestMatch.name] = kill.victimId;
                            this.mappingConfidence[kill.victimId] = bestScore;

                            // Also update mapping for the hero we're replacing
                            if (currentHeroName) {
                                this.victimIdToHero[otherVictimId] = currentHeroName;
                                this.heroToVictimId[currentHeroName] = otherVictimId;
                                this.mappingConfidence[otherVictimId] = Math.min(currentConfidence, 0.5);
                            }

                            const confidencePct = Math.round(bestScore * 100);
                            util.logMessage(
                                `Reassigned: VictimID ${kill.victimId} to ${this.formatHeroName(bestMatch.name)} (${confidencePct}% confidence)`,
                                SYSTEM_EMOJIS.INFO
                            );
                        }
                    }
                    // Simple replacement - no conflict with other mappings
                    else {
                        // Remove current hero's mapping if it exists
                        if (currentHeroName) {
                            delete this.heroToVictimId[currentHeroName];
                        }

                        // Create new mapping
                        this.victimIdToHero[kill.victimId] = bestMatch.name;
                        this.heroToVictimId[bestMatch.name] = kill.victimId;
                        this.mappingConfidence[kill.victimId] = bestScore;
                        // NEW: Check if confidence is high enough to lock
                        this.lockHighConfidenceMappings(kill.victimId);
                        const confidencePct = Math.round(bestScore * 100);
                        util.logMessage(
                            `Updated: VictimID ${kill.victimId} to ${this.formatHeroName(bestMatch.name)} (${confidencePct}% confidence)`,
                            SYSTEM_EMOJIS.INFO
                        );
                    }
                }
            }
        });
    }

    trackVisibleEnemies(gameState) {
        if (!gameState.minimap) return;

        // Track all enemy heroes visible on minimap
        for (const key in gameState.minimap) {
            const entity = gameState.minimap[key];

            if (this.isEnemy(entity)) {
                const heroName = entity.name;

                if (!this.enemyHeroes[heroName]) {
                    this.enemyHeroes[heroName] = {
                        id: key,
                        name: heroName,
                        displayName: this.formatHeroName(heroName)
                    };

                    util.logMessage(`Found enemy ${this.formatHeroName(heroName)}`, SYSTEM_EMOJIS.INFO);
                }
            }
        }
    }

    detectNewKills(gameState) {
        if (!gameState.player || !gameState.player.kill_list) return [];

        const currentKillList = gameState.player.kill_list;
        const timestamp = gameState.map.game_time;
        const newKills = [];

        // Compare with previous kill list to find new kills
        for (const victimKey in currentKillList) {
            const victimId = parseInt(victimKey.split('_')[1]);
            const currentCount = currentKillList[victimKey];
            const previousCount = this.previousKillList[victimKey] || 0;

            if (currentCount > previousCount) {
                newKills.push({
                    victimId: victimId,
                    count: currentCount - previousCount,
                    timestamp: timestamp
                });

                // Record kill timestamp
                this.killTimestamps[victimId] = timestamp;
            }
        }

        return newKills;
    }

    detectDisappearedEnemies(gameState) {
        if (!gameState.minimap || !this.previousMinimap) return [];

        const timestamp = gameState.map.game_time;
        const disappearedEnemies = [];
        const currentEnemiesSet = new Set();

        // Create set of currently visible enemy heroes
        for (const key in gameState.minimap) {
            const entity = gameState.minimap[key];
            if (this.isEnemy(entity)) {
                currentEnemiesSet.add(entity.name);
            }
        }

        // Check which enemies were visible before but not now
        for (const key in this.previousMinimap) {
            const entity = this.previousMinimap[key];
            if (this.isEnemy(entity)) {
                if (!currentEnemiesSet.has(entity.name)) {
                    disappearedEnemies.push({
                        name: entity.name,
                        timestamp: timestamp,
                        lastPosition: {
                            x: entity.xpos,
                            y: entity.ypos
                        }
                    });
                }
            }
        }

        return disappearedEnemies;
    }

    calculateDistance(x1, y1, x2, y2) {
        return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    }

    reportKills(newKills) {
        newKills.forEach(kill => {
            const heroName = this.victimIdToHero[kill.victimId];
            const confidence = this.mappingConfidence[kill.victimId] || 0;

            if (heroName) {
                let message = `Killed ${this.formatHeroName(heroName)}`;

                // Add confidence indicator for less certain matches
                if (confidence < 0.7) {
                    message += ` (probable)`;
                } else if (confidence < 0.5) {
                    message += ` (possible)`;
                }

                // Add kill count
                const totalKills = this.getKillCountForVictim(kill.victimId);
                message += ` - Total kills: ${totalKills}`;

                util.logMessage(message, COMBAT_EMOJIS.KILL);
            } else {
                util.logMessage(`Killed unknown enemy (Victim ID: ${kill.victimId})`, COMBAT_EMOJIS.KILL);
            }
        });
    }

    reportKillSummary() {
        // Don't report if we haven't found any heroes yet
        if (Object.keys(this.enemyHeroes).length === 0) return;

        util.logMessage("===== KILL SUMMARY =====", SYSTEM_EMOJIS.INFO);

        // Get total kill count
        let totalKills = 0;
        for (const victimKey in this.previousKillList) {
            totalKills += this.previousKillList[victimKey];
        }

        util.logMessage(`Total enemy kills: ${totalKills}`, SYSTEM_EMOJIS.INFO);

        // Report kills for each known enemy
        Object.values(this.enemyHeroes).forEach(hero => {
            const victimId = this.heroToVictimId[hero.name];
            const kills = this.getKillCountForHero(hero.name);
            const confidenceStr = victimId !== undefined ?
                ` (${Math.round((this.mappingConfidence[victimId] || 0) * 100)}% confidence)` :
                ` (unmapped)`;

            util.logMessage(`${hero.displayName}: ${kills} kills${confidenceStr}`, SYSTEM_EMOJIS.INFO);
        });

        util.logMessage("=========================", SYSTEM_EMOJIS.INFO);
    }

    getKillCountForHero(heroName) {
        const victimId = this.heroToVictimId[heroName];
        return this.getKillCountForVictim(victimId);
    }

    getKillCountForVictim(victimId) {
        if (victimId !== undefined && this.previousKillList[`victimid_${victimId}`]) {
            return this.previousKillList[`victimid_${victimId}`];
        }
        return 0;
    }

    updatePreviousState(gameState) {
        // Update kill list
        if (gameState.player && gameState.player.kill_list) {
            this.previousKillList = {...gameState.player.kill_list};
        }

        // Update minimap state (only enemy heroes)
        if (gameState.minimap) {
            this.previousMinimap = {};
            for (const key in gameState.minimap) {
                const entity = gameState.minimap[key];
                if (this.isEnemy(entity)) {
                    this.previousMinimap[key] = {...entity};
                }
            }
        }
    }

    formatHeroName(heroName) {
        if (!heroName) return "Unknown";

        if (heroName.startsWith('npc_dota_hero_')) {
            const baseName = heroName.substring('npc_dota_hero_'.length);
            return baseName.split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }
        return heroName;
    }

    isEnemy(entity) {
        return entity.image === 'minimap_enemyicon' && entity.name && entity.name.startsWith('npc_dota_hero_');
    }
}

module.exports = Enemy;