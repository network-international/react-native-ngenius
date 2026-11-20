/**
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */

const path = require('path');

const appNodeModules = path.resolve(__dirname, 'node_modules');
const sdkRoot = path.resolve(__dirname, '..');

module.exports = {
  projectRoot: __dirname,
  watchFolders: [sdkRoot],
  resolver: {
    // Use the app's React copy; resolving the SDK's copy causes Invalid Hook Call.
    disableHierarchicalLookup: true,
    nodeModulesPaths: [appNodeModules],
    extraNodeModules: {
      '@network-international/react-native-ngenius': sdkRoot,
      react: path.join(appNodeModules, 'react'),
      'react-native': path.join(appNodeModules, 'react-native'),
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
