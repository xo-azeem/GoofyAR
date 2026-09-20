const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle .glb files as assets so built-in models can be loaded with require().
config.resolver.assetExts = Array.from(new Set([...config.resolver.assetExts, 'glb']));

module.exports = config;
