class Health {
    constructor(hueService) {
        this.hueService = hueService;
    }

    async processGameState(gameState) {
        // Ensure the player object and health data exists
        if (!gameState.hero || gameState.hero.health === undefined || gameState.hero.max_health === undefined) {
            return;
        }

        // Calculate health percentage
        const healthPercentage = (gameState.hero.health / gameState.hero.max_health) * 100;

        // Update the LED strip to reflect current health
        await this.hueService.updateHealthBar(healthPercentage);
    }
}

module.exports = Health;