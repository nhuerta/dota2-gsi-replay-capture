# Dota 2 GSI Replay Capture

A Node.js application that leverages Dota 2's Game State Integration (GSI) to automatically capture and save replay clips for key game events through OBS Studio.

## Features

- **Mirana Sacred Arrow Tracking**: Automatically detects potential Sacred Arrow hits and saves replay clips
- **Kill Streak Detection**: Captures multikills (double kill, triple kill, etc.) and killing sprees
- **OBS Integration**: Seamless integration with OBS Studio via WebSocket protocol
- **Detailed Logging**: Comprehensive logging of game states and events
- **File Rotation**: Intelligent handling of game state logs with file rotation

## Requirements

- Node.js 14+
- OBS Studio 28+ with WebSocket plugin enabled
- Dota 2 with Game State Integration enabled
- Windows, macOS, or Linux operating system

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/nhuerta/dota2-gsi-replay-capture.git
   cd dota2-gsi-replay-capture
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file for local environment variables:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file with your OBS WebSocket credentials and other preferences.

## Dota 2 GSI Setup

1. Create a GSI config file in your Dota 2 cfg directory:
   ```
   [Steam Installation Path]\steamapps\common\dota 2 beta\game\dota\cfg\gamestate_integration\
   ```

2. Create a file named `gamestate_integration_nodejs.cfg` with the following content:
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

## OBS Setup

1. In OBS Studio, go to Tools > WebSocket Server Settings
2. Enable the WebSocket server
3. Set a password if desired (make sure it matches the one in your config.js)
4. Configure your Replay Buffer settings in OBS:
    - Settings > Output > Replay Buffer
    - Set an appropriate seconds value (recommended: 30-60 seconds)

## Usage

1. Start OBS Studio first and ensure the WebSocket server is running
2. Start the Node.js application:
   ```bash
   npm start
   ```
3. Launch Dota 2 and play as Mirana or any hero to capture kill streaks
4. The application will automatically save replay clips when:
    - You hit an enemy with Mirana's Sacred Arrow
    - You get multiple kills in quick succession (Double Kill, Triple Kill, etc.)

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

## Directory Structure

```
dota2-gsi-replay-capture/
├── app.js                 # Main application entry point
├── config/                # Configuration directory
│   ├── default.js         # Default configuration values
│   └── index.js           # Environment-specific configuration
├── killstreak.js          # Kill streak detection logic
├── logger.js              # Winston logger setup
├── mirana.js              # Mirana arrow detection logic
├── obs-service.js         # OBS WebSocket integration
├── gamestate-logger.js    # Game state logging utility
├── emojis.js              # Emoji constants for logging
├── util.js                # Utility functions
├── .env                   # Environment variables (not tracked in git)
├── .env.example           # Example environment variables template
├── logs/                  # Log files
└── recordings/            # Saved replay clips
```

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

- Valve for the Dota 2 Game State Integration API
- OBS for the WebSocket API
- Contributors to the obs-websocket-js library