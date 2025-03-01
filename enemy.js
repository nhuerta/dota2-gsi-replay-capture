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
    }

    updateEnemies(gameState) {
        // Update our catalog of known enemy heroes
        this.trackVisibleEnemies(gameState);

        // Detect new kills that occurred since last update
        const newKills = this.detectNewKills(gameState);

        // Identify which enemies disappeared from the minimap
        const disappearedEnemies = this.detectDisappearedEnemies(gameState);

        // Map disappeared enemies to victim IDs when both occur together
        if (newKills.length > 0 && disappearedEnemies.length > 0) {
            this.correlateKillsWithDisappearances(newKills, disappearedEnemies);
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

    trackVisibleEnemies(gameState) {
        if (!gameState.minimap) return;

        // Track all enemy heroes visible on minimap
        for (const key in gameState.minimap) {
            const entity = gameState.minimap[key];

            if (entity.image === 'minimap_enemyicon' && entity.name && entity.name.startsWith('npc_dota_hero_')) {
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
            if (entity.image === 'minimap_enemyicon' && entity.name && entity.name.startsWith('npc_dota_hero_')) {
                currentEnemiesSet.add(entity.name);
            }
        }

        // Check which enemies were visible before but not now
        for (const key in this.previousMinimap) {
            const entity = this.previousMinimap[key];
            if (entity.image === 'minimap_enemyicon' && entity.name && entity.name.startsWith('npc_dota_hero_')) {
                if (!currentEnemiesSet.has(entity.name)) {
                    disappearedEnemies.push({
                        name: entity.name,
                        timestamp: timestamp
                    });
                }
            }
        }

        return disappearedEnemies;
    }

    correlateKillsWithDisappearances(newKills, disappearedEnemies) {
        // For each kill, find the most likely disappeared enemy
        newKills.forEach(kill => {
            // Skip if we already have high confidence in this mapping
            if (this.mappingConfidence[kill.victimId] >= 0.9) return;

            let bestMatch = null;
            let bestScore = 0;

            // Find the disappeared enemy with timing closest to the kill
            disappearedEnemies.forEach(enemy => {
                // Skip if this hero is already mapped to another victim with high confidence
                const existingVictimId = this.heroToVictimId[enemy.name];
                if (existingVictimId !== undefined &&
                    existingVictimId !== kill.victimId &&
                    this.mappingConfidence[existingVictimId] >= 0.8) {
                    return;
                }

                // Calculate correlation score - higher is better match
                // Perfect timing = 1.0 score, degrades with time difference
                const timeDiff = Math.abs(kill.timestamp - enemy.timestamp);
                const timeScore = Math.max(0, 1 - (timeDiff / 2)); // 2 second window

                if (timeScore > bestScore) {
                    bestScore = timeScore;
                    bestMatch = enemy;
                }
            });

            // If we found a good match (above threshold)
            if (bestMatch && bestScore > 0.3) {
                // Update our mappings
                this.victimIdToHero[kill.victimId] = bestMatch.name;
                this.heroToVictimId[bestMatch.name] = kill.victimId;

                // Update confidence - increase with each correlation
                const oldConfidence = this.mappingConfidence[kill.victimId] || 0;
                this.mappingConfidence[kill.victimId] = Math.min(1, oldConfidence + (bestScore * 0.4));

                const confidencePct = Math.round(this.mappingConfidence[kill.victimId] * 100);
                util.logMessage(
                    `Mapped VictimID ${kill.victimId} to ${this.formatHeroName(bestMatch.name)} (${confidencePct}% confidence)`,
                    SYSTEM_EMOJIS.INFO
                );

                // Remove this enemy from disappeared list to avoid double-matching
                disappearedEnemies = disappearedEnemies.filter(e => e.name !== bestMatch.name);
            }
        });
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
                if (entity.image === 'minimap_enemyicon' && entity.name && entity.name.startsWith('npc_dota_hero_')) {
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
}

module.exports = Enemy;