/**
 * Extract and sanitize hero name from Dota 2 format
 * @param {string} heroName - Hero name, possibly in npc_dota_hero_xxx format
 * @returns {string} - Clean hero name
 */
function sanitizeHeroName(heroName) {
    if (!heroName) return '';

    if (heroName.startsWith('npc_dota_hero_')) {
        const baseName = heroName.substring('npc_dota_hero_'.length);
        return baseName.split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    return heroName;
}

function logMessage(message, emoji = null) {
    const timestamp = new Date().toISOString();
    const emojiPrefix = emoji ? `${emoji} ` : '';
    console.log(`[${timestamp}] ${emojiPrefix}${message}`);
}

function getEnemiesFromMinimap(gameState) {
    if (!gameState.minimap) return [];

    return Object.values(gameState.minimap)
        .filter(obj => obj.image === 'minimap_enemyicon');
}

module.exports = {
    sanitizeHeroName,
    logMessage,
    getEnemiesFromMinimap
};