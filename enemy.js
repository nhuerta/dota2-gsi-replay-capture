const { SYSTEM_EMOJIS } = require('./emojis');
const util = require('./util');

class Enemy {
    constructor() {
        this.enemyTable = {};
        this.isEnemyTablePrinted = false;
    }

    foundAllEnemies() {
        return Object.keys(this.enemyTable).length >= 5;
    }

    updateEnemies(gameState) {
        if (!this.isEnemyTablePrinted && this.foundAllEnemies()) {
            Object.entries(this.enemyTable).forEach(([enemyName, enemy]) => {
                util.logMessage(`Found enemy \x1b[32m${
                    util.sanitizeHeroName(enemyName)
                }\x1b[0m`, SYSTEM_EMOJIS.INFO);
            });
            this.isEnemyTablePrinted = true;
        }
        const enemies = util.getEnemiesFromMinimap(gameState);
        for (const enemy of enemies) {
            if (!enemy.name) continue;
            this.enemyTable[enemy.name] = enemy;
        }
    }
}

module.exports = Enemy;