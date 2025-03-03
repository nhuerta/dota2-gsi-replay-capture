const { SYSTEM_EMOJIS, COMBAT_EMOJIS } = require('./emojis');
const util = require('./util');

class Enemy {
    constructor() {
        this.enemyHeroes = {};        // Known enemy heroes
        this.victimIdToHero = {};     // Simple mapping of victim IDs to heroes
        this.previousKillList = {};   // Previous kill counts
        this.lastReportTime = 0;      // For periodic reporting
        this.killList =  {
            "victimid_0": 0,
            "victimid_1": 0,
            "victimid_2": 0,
            "victimid_3": 0,
            "victimid_4": 0
        }
    }

    trackEnemies(gameState) {
        if (!gameState.minimap) return;

        // Track enemies from minimap
        for (const key in gameState.minimap) {
            const entity = gameState.minimap[key];
            if (entity.image === 'minimap_enemyicon' && entity.name &&
                entity.name.startsWith('npc_dota_hero_')) {
                const heroName = entity.name;
                if (!this.enemyHeroes[heroName]) {
                    const displayName = util.sanitizeHeroName(heroName);
                    this.enemyHeroes[heroName] = {
                        name: heroName,
                        displayName: displayName
                    };
                    util.logMessage(`Found enemy ${displayName}`, SYSTEM_EMOJIS.INFO);
                }
            }
        }

        // Simple mapping: any unmapped victim gets mapped to any unmapped hero
        if (gameState.player && gameState.player.kill_list) {
            for (const victimKey in gameState.player.kill_list) {
                const victimId = parseInt(victimKey.split('_')[1]);
                if (!this.victimIdToHero[victimId]) {
                    for (const heroName in this.enemyHeroes) {
                        if (!Object.values(this.victimIdToHero).includes(heroName)) {
                            this.victimIdToHero[victimId] = heroName;
                            break;
                        }
                    }
                }
            }
        }
    }

    detectNewKills(gameState) {
        if (!gameState.player || !gameState.player.kill_list) return [];

        const currentKillList = gameState.player.kill_list;
        const newKills = [];

        for (const victimKey in currentKillList) {
            const currentCount = currentKillList[victimKey];
            const previousCount = this.previousKillList[victimKey] || 0;

            if (currentCount > previousCount) {
                const victimId = parseInt(victimKey.split('_')[1]);
                newKills.push({ victimId, count: currentCount - previousCount });

                const heroName = this.victimIdToHero[victimId];
                const displayName = heroName ? this.enemyHeroes[heroName].displayName :
                    `Unknown (ID: ${victimId})`;

                util.logMessage(`Killed ${displayName} - Total: ${currentCount}`, COMBAT_EMOJIS.KILL);
            }
        }

        return newKills;
    }

    reportKillSummary() {
        if (Object.keys(this.previousKillList).length === 0) return;

        util.logMessage("===== KILL SUMMARY =====", SYSTEM_EMOJIS.INFO);

        let totalKills = 0;
        for (const victimKey in this.previousKillList) {
            totalKills += this.previousKillList[victimKey];
        }
        util.logMessage(`Total enemy kills: ${totalKills}`, SYSTEM_EMOJIS.INFO);

        for (const victimKey in this.previousKillList) {
            const victimId = parseInt(victimKey.split('_')[1]);
            const kills = this.previousKillList[victimKey];

            const heroName = this.victimIdToHero[victimId];
            const displayName = heroName ? this.enemyHeroes[heroName].displayName :
                `Unknown (ID: ${victimId})`;

            util.logMessage(`${displayName}: ${kills} kills`, SYSTEM_EMOJIS.INFO);
        }

        util.logMessage("=========================", SYSTEM_EMOJIS.INFO);
    }

    updateEnemies(gameState) {
        this.trackEnemies(gameState);
        const newKills = this.detectNewKills(gameState);

        if (newKills.length > 0) {
            this.reportKillSummary();
        }

        const currentTime = gameState.map?.game_time || 0;
        if (currentTime - this.lastReportTime >= 60) {
            this.reportKillSummary();
            this.lastReportTime = currentTime;
        }

        if (gameState.player && gameState.player.kill_list) {
            this.previousKillList = {...gameState.player.kill_list};
        }
    }
}

module.exports = Enemy;
