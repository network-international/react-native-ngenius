/**
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */

const path = require('path');

module.exports = {
  projectRoot: __dirname,
  watchFolders: [
    path.resolve(__dirname, '..'),
  ],
  resolver: {
    extraNodeModules: {
      '@network-international/react-native-ngenius': path.resolve(__dirname, '..'),
    },
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};
