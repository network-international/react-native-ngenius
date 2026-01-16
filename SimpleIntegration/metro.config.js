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
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
    ],
    extraNodeModules: {
      '@network-international/react-native-ngenius': path.resolve(__dirname, '..'),
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-native': path.resolve(__dirname, 'node_modules/react-native'),
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
