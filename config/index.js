require('dotenv').config();
const defaultConfig = require('./default');

// You can add environment-specific configurations here
const config = {
    development: defaultConfig,
    production: defaultConfig,
    test: defaultConfig
}[process.env.NODE_ENV || 'development'];

module.exports = config;