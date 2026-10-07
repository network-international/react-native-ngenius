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
    // Local SDK sources live in the parent repo, which has its own
    // node_modules/react (devDependency 16.9). Hierarchical lookup
    // from those files would bind NgeniusTokenization to a second
    // React instance and throw Invalid hook call. Always use the app copy.
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
