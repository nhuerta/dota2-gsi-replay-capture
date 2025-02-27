/**
 * Extract and sanitize hero name from Dota 2 format
 * @param {string} heroName - Hero name, possibly in npc_dota_hero_xxx format
 * @returns {string} - Clean hero name
 */
function sanitizeHeroName(heroName) {
    if (!heroName) return '';

    // Extract hero name if in npc_dota_hero_xxx format
    let cleanName = heroName;
    if (cleanName.startsWith('npc_dota_hero_')) {
        cleanName = cleanName.replace('npc_dota_hero_', '');
    }

    // Remove special characters but preserve hyphens
    return cleanName.replace(/[^a-zA-Z0-9-]/g, '');
}

function logMessage(message, emoji = null) {
    const timestamp = new Date().toISOString();
    const emojiPrefix = emoji ? `${emoji} ` : '';
    console.log(`[${timestamp}] ${emojiPrefix}${message}`);
}

module.exports = {
    sanitizeHeroName,
    logMessage
};