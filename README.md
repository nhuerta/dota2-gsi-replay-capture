# Dota 2 GSI Replay Capture

An intelligent Dota 2 companion application that automatically detects significant game events and captures replay highlights using OBS Studio.

## Overview

This application uses Dota 2's Game State Integration (GSI) API to process real-time game state data. When notable events occur (multi-kills, successful ability combos, etc.), the system automatically triggers OBS Studio to save a replay, creating a collection of your best gameplay moments without manual intervention.

## Features

- **Real-time game state processing** via Dota 2 GSI API
- **Automatic highlight detection** for:
    - Multi-kills and kill streaks (Double Kill, Triple Kill, Rampage, etc.)
    - Killing sprees (Killing Spree, Dominating, Godlike, etc.)
    - First blood recognition (for player and team)
    - Hero-specific ability usage tracking (currently supports Mirana)
    - Sacred Arrow hit detection with intelligent enemy movement analysis
- **Advanced enemy tracking system** that:
    - Maps enemy heroes to victim IDs using probabilistic correlation
    - Builds confidence scores for hero-victim mappings over time
    - Validates mappings by monitoring minimap presence/absence
    - Auto-corrects invalid mappings when inconsistencies are detected
- **Automatic OBS integration** for replay capture and management:
    - Uses OBS WebSocket protocol for remote control
    - Automatically saves and organizes replay clips with descriptive filenames
    - Supports customizable buffer length and output locations
- **Comprehensive logging and state persistence**:
    - Structured logging with timestamps and emoji indicators
    - Game state recording with automatic file rotation
    - Match-based organization of log data
- **Configurable via environment variables** for easy deployment

## Requirements

- Node.js (v14+)
- OBS Studio (v28+) with WebSocket server enabled
- Dota 2 with Game State Integration configured
- Windows, macOS, or Linux operating system

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/nhuerta/dota2-gsi-replay-capture.git
   cd dota2-gsi-replay-capture
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on the sample below:
   ```
   # OBS Configuration
   OBS_ADDRESS=ws://localhost:4455
   OBS_PASSWORD=your_obs_websocket_password
   OBS_REPLAY_BUFFER_SECONDS=40
   OBS_SCENE_NAME=Dota2
   OBS_OUTPUT_PATH=./recordings
   OBS_ENABLED=true

   # Server Configuration
   PORT=3000

   # Logging Configuration
   LOG_LEVEL=info
   LOG_DIRECTORY=./logs
   
   # Environment
   NODE_ENV=development
   ```

4. Configure Dota 2 GSI:
    - Create a directory: `[Steam Installation Path]\steamapps\common\dota 2 beta\game\dota\cfg\gamestate_integration\`
    - Create a file named `gamestate_integration_nodejs.cfg` with the following content:
   ```
   "Dota 2 Integration Configuration"
   {
       "uri"               "http://localhost:3000/"
       "timeout"           "5.0"
       "buffer"            "0.1"
       "throttle"          "0.1"
       "heartbeat"         "30.0"
       "data"
       {
           "provider"      "1"
           "map"           "1"
           "player"        "1"
           "hero"          "1"
           "abilities"     "1"
           "items"         "1"
           "minimap"       "1"
       }
   }
   ```

5. Configure OBS Studio:
    - Enable WebSocket server in OBS (Tools > WebSocket Server Settings)
    - Set a password and make sure it matches the one in your .env file
    - Configure your Replay Buffer settings in OBS:
        - Settings > Output > Replay Buffer
        - Set an appropriate seconds value (recommended: 30-60 seconds)
    - Enable the Replay Buffer feature in OBS

## Usage

1. Start OBS Studio first and ensure the WebSocket server is running
2. Start the application:
   ```bash
   npm start
   ```
3. Launch Dota 2 and play a match
4. The application will automatically detect game events and save replays:
    - When you hit an enemy with Mirana's Sacred Arrow
    - When you get multiple kills in quick succession (Double Kill, Triple Kill, etc.)
    - When you achieve killing sprees (Killing Spree, Dominating, etc.)
    - Other notable events based on the tracking systems

## Architecture

The application consists of several specialized modules working together to process game state data:

- **App (app.js)**: Express server that receives GSI updates and coordinates processing between all components
- **Enemy Tracker (enemy.js)**: Maps enemy heroes to victim IDs using probabilistic techniques and confidence scoring
- **Mirana Tracker (mirana.js)**: Detects Mirana ability usage and successful Sacred Arrow hits through movement analysis
- **Kill Streak Tracker (killstreak.js)**: Monitors multi-kills, kill streaks, and first blood events
- **OBS Service (obs-service.js)**: Manages OBS WebSocket connection and handles replay saving with metadata
- **Game State Logger (gamestate-logger.js)**: Records game state data for analysis with automatic file rotation
- **Configuration (config/)**: Manages environment-specific configuration with flexible override system
- **Utility (util.js)**: Provides shared helper functions for hero name formatting and logging

## Directory Structure

```
dota2-gsi-replay-capture/
├── app.js                 # Main application entry point
├── config/                # Configuration directory
│   ├── default.js         # Default configuration values
│   └── index.js           # Environment-specific configuration
├── enemy.js               # Enemy tracking and victim mapping logic
├── killstreak.js          # Kill streak detection logic
├── logger.js              # Winston logger setup
├── mirana.js              # Mirana ability and arrow detection logic
├── obs-service.js         # OBS WebSocket integration
├── gamestate-logger.js    # Game state logging utility
├── emojis.js              # Emoji constants for logging
├── util.js                # Utility functions
├── .env                   # Environment variables (not tracked in git)
├── .env.example           # Example environment variables template
├── logs/                  # Log files
└── recordings/            # Saved replay clips
```

## How Tracking Works

### Enemy Tracking System

The enemy tracking system uses sophisticated probabilistic techniques to map enemy heroes to their victim IDs:

1. **Time Correlation**: Associates heroes disappearing from the minimap with kill events
2. **Proximity Analysis**: Uses player position to determine likely kill targets (closer enemies are more likely targets)
3. **Extended Absence Verification**: Confirms kills when heroes remain missing from the minimap
4. **Confidence Scoring**: Maintains confidence levels (0-1) for each hero-to-victim mapping
5. **Mapping Validation**: Checks if supposedly killed heroes reappear unexpectedly
6. **Auto-Correction**: Adjusts mappings when inconsistencies are detected and reassigns with appropriate confidence
7. **Mapping Locking**: Prevents high-confidence mappings (>85%) from being changed without strong evidence
8. **Kill Reporting**: Provides updates on kills with confidence indicators (probable/possible)

The system continuously improves its mapping accuracy as the game progresses, producing increasingly reliable kill attribution.

### Ability Tracking

The ability tracking system (currently focused on Mirana):

1. **Ability Detection**: Identifies ability usage by monitoring:
    - Cooldown state transitions (0 → active)
    - Charge count decreases for charge-based abilities
    - "Can cast" state changes

2. **Sacred Arrow Hit Detection**: Uses a multi-factor approach:
    - Records enemy positions when Arrow is cast
    - Monitors enemy movement patterns during Arrow's flight time (0.5-3 seconds)
    - Identifies potential hits when enemies become stationary within range
    - Considers player position and maximum arrow travel distance (3000 units)

3. **Event Capture**: When a hit is detected:
    - Triggers OBS to save a replay segment
    - Records metadata including enemy name, timing, and position
    - Logs the event with proper formatting and identifiers

### Kill Streak Detection

The kill streak system detects and classifies significant kill achievements:

1. **Multi-Kill Tracking**:
    - Monitors kills within an 18-second window
    - Classifies streaks (Double Kill, Triple Kill, Ultra Kill, Rampage)
    - Saves replay clips for significant multi-kills

2. **Killing Spree Monitoring**:
    - Counts consecutive kills without dying
    - Identifies achievement levels (Killing Spree, Dominating, Godlike, etc.)
    - Resets counter on player death with appropriate messaging

3. **First Blood Detection**:
    - Recognizes the first kill of the match
    - Differentiates between player achievement and team achievement
    - Provides appropriate notifications based on which team claimed first blood

## Configuration

This project uses a flexible configuration system that supports environment variables and different environments (development, production, test).

### Configuration Structure

- `config/default.js`: Contains default configuration values with environment variable fallbacks
- `config/index.js`: Loads the appropriate configuration based on NODE_ENV

### Configuration Options

- **Server Settings**:
    - `port`: The port for the GSI HTTP server (default: 3000)

- **OBS Settings**:
    - `address`: OBS WebSocket address (default: ws://localhost:4455)
    - `password`: OBS WebSocket password
    - `replayBufferSeconds`: Length of replay buffer (default: 40 seconds)
    - `outputPath`: Directory to save replays (default: ./recordings)
    - `sceneName`: OBS scene to use for recording (default: Dota2)
    - `enabled`: Enable/disable OBS integration (default: true)

- **Logging Settings**:
    - `directory`: Directory for log files (default: ./logs)
    - `level`: Logging level (default: info)

### Environment Variables

All configuration options can be overridden using environment variables:

- `PORT`: Server port
- `OBS_ADDRESS`: OBS WebSocket address
- `OBS_PASSWORD`: OBS WebSocket password
- `OBS_REPLAY_BUFFER_SECONDS`: Length of replay buffer in seconds
- `OBS_SCENE_NAME`: OBS scene name
- `OBS_OUTPUT_PATH`: Directory to save replays
- `OBS_ENABLED`: Enable/disable OBS integration
- `LOG_LEVEL`: Logging level
- `LOG_DIRECTORY`: Directory for log files
- `NODE_ENV`: Environment (development, production, test)

## Troubleshooting

- **OBS Not Connecting**: Verify WebSocket server is enabled in OBS and the password matches
- **Highlights Not Saving**: Ensure Replay Buffer is enabled and running in OBS
- **Game State Not Updating**: Confirm GSI configuration file is correctly installed in the proper directory
- **Console Errors**: Check logs directory for detailed error information
- **No Events Detected**: Make sure all required GSI data types are enabled in the GSI configuration

## Future Development

- Support for additional heroes beyond Mirana
- Voice control commands for saving a replay buffer and correcting confidence levels
- Support for interfacing with Philips Hue Bridge for LED effects (in progress)
- Expanded event detection (teamfights, Roshan kills, etc.)
- User interface for configuration and highlight management
- Performance metrics and analysis based on captured game data
- Integration with external APIs for more detailed game information
- Advanced ML-based detection for complex game scenarios
- Support for team-based events and coordination detection

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Valve for Dota 2 and the Game State Integration API
- OBS Studio for the WebSocket API
- Contributors to the obs-websocket-js library
- The Node.js community for the excellent libraries and tools

---

*This project is not affiliated with or endorsed by Valve Corporation.*