/**
 * emojis.js
 * Defines emoji constants for Dota 2 game state tracking
 *
 * This module provides a centralized location for all emoji definitions
 * used in the application. Each emoji is grouped by category and
 * exported as a frozen object to prevent modifications.
 */

// Hero-specific emojis for abilities and actions
const HERO_EMOJIS = {
    MIRANA: '🏹',      // Mirana character icon
    ARROW: '🎯',       // Sacred Arrow ability
    STARFALL: '⭐',     // Starstorm ability
    LEAP: '🦌',        // Leap ability
    MOONLIGHT: '🌙',   // Moonlight Shadow ultimate
};

// Combat and game state emojis
const COMBAT_EMOJIS = {
    KILL: '💀',        // Hero kills
    ASSIST: '👊',      // Assists
    SPREE: '🔥',       // Kill streaks
    DEATH: '☠️',       // Deaths
    AEGIS: '🛡️',      // Aegis pickup/usage
    ROSHAN: '👹',      // Roshan encounters
};

// Resource and economy emojis
const RESOURCE_EMOJIS = {
    GOLD: '💰',        // Gold earned/GPM
    LEVEL: '⬆️',       // Level ups
    ITEM: '📦',        // Item acquisitions
    WARD: '👁️',        // Ward placements
    BOTTLE: '🍶',      // Bottle/Rune usage
};

// System status emojis
const SYSTEM_EMOJIS = {
    START: '🎮',       // System startup
    WARNING: '⚠️',     // Warnings
    ERROR: '❌',       // Errors
    SUCCESS: '✅',     // Success messages
    INFO: 'ℹ️',        // Information messages
};

// Combine all emoji categories into a single object
const ALL_EMOJIS = {
    ...HERO_EMOJIS,
    ...COMBAT_EMOJIS,
    ...RESOURCE_EMOJIS,
    ...SYSTEM_EMOJIS,
};

// Export individual categories for selective importing
module.exports = {
    HERO_EMOJIS: Object.freeze(HERO_EMOJIS),
    COMBAT_EMOJIS: Object.freeze(COMBAT_EMOJIS),
    RESOURCE_EMOJIS: Object.freeze(RESOURCE_EMOJIS),
    SYSTEM_EMOJIS: Object.freeze(SYSTEM_EMOJIS),
    ALL_EMOJIS: Object.freeze(ALL_EMOJIS),
};