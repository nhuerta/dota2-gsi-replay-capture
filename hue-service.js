const v3 = require('node-hue-api').v3;
const LightState = v3.lightStates.LightState;

/**
 * Service to control Philips Hue LED strips for health bar visualization
 */
class HueService {
    /**
     * Initialize the Hue Service
     *
     * @param {Object} logger - The application logger
     * @param {Object} config - Configuration for Hue integration
     */
    constructor(logger, config) {
        this.logger = logger;
        this.config = config;
        this.api = null;
        this.lightId = config.lightId; // The ID of the LED strip
        this.connected = false;
    }

    /**
     * Connect to the Hue Bridge
     */
    async connect() {
        try {
            this.logger.info('Connecting to Philips Hue Bridge');

            // Discover bridges on the network
            const discoveryResults = await v3.discovery.nupnpSearch();

            if (discoveryResults.length === 0) {
                throw new Error('No Hue Bridges discovered on the network');
            }

            const bridgeIp = discoveryResults[0].ipaddress;
            this.logger.info('Found Hue Bridge', { ip: bridgeIp });

            // Create a new API instance and connect using the configured username
            this.api = await v3.api.createLocal(bridgeIp).connect(this.config.username);

            // Verify the light exists
            const light = await this.api.lights.getLight(this.lightId);
            this.logger.info('Connected to Hue LED strip', {
                name: light.name,
                id: light.id,
                type: light.type
            });

            this.connected = true;

            // Turn on the light at startup with green color
            await this.updateHealthBar(100);

            return true;
        } catch (error) {
            this.logger.error('Failed to connect to Hue Bridge', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Convert health percentage to RGB color with smooth gradients
     *
     * @param {number} healthPercentage - Health percentage (0-100)
     * @returns {Object} RGB color values
     */
    _getColorFromHealthPercentage(healthPercentage) {
        // Ensure health percentage is between 0 and 100
        healthPercentage = Math.max(0, Math.min(100, healthPercentage));

        let red, green;

        if (healthPercentage > 50) {
            // Green to Yellow gradient (100% to 50%)
            // As health decreases from 100% to 50%, red increases from 0 to 255
            red = Math.round(255 * (2 - (healthPercentage / 50)));
            green = 255;
        } else {
            // Yellow to Red gradient (50% to 0%)
            // As health decreases from 50% to 0%, green decreases from 255 to 0
            red = 255;
            green = Math.round(255 * (healthPercentage / 50));
        }

        return { red, green, blue: 0 };
    }

    /**
     * Update LED strip color based on health percentage
     *
     * @param {number} healthPercentage - Health percentage (0-100)
     */
    async updateHealthBar(healthPercentage) {
        try {
            if (!this.connected) {
                this.logger.warn('Hue API not connected, cannot update health bar');
                return;
            }

            const rgb = this._getColorFromHealthPercentage(healthPercentage);

            // Convert RGB to XY color space used by Philips Hue
            const xy = v3.model.rgbToXy(rgb.red, rgb.green, rgb.blue);

            const state = new LightState()
                .on()
                .xy(xy.x, xy.y)
                .brightness(254); // Full brightness

            await this.api.lights.setLightState(this.lightId, state);

            this.logger.debug('Updated LED health bar', {
                healthPercentage,
                color: rgb
            });

        } catch (error) {
            this.logger.error('Failed to update LED health bar', {
                error: error.message,
                healthPercentage
            });
        }
    }

    /**
     * Gracefully shutdown the Hue service
     */
    async shutdown() {
        try {
            if (this.connected) {
                // Turn off the light when shutting down
                const state = new LightState().off();
                await this.api.lights.setLightState(this.lightId, state);
                this.logger.info('Turned off LED strip during shutdown');
            }
        } catch (error) {
            this.logger.error('Error during Hue service shutdown', {
                error: error.message,
                stack: error.stack
            });
        }
    }
}

module.exports = HueService;