module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^react$': '<rootDir>/node_modules/react',
    '^react-native$': '<rootDir>/node_modules/react-native',
    '^react-native-svg$': '<rootDir>/src/tokenization/__tests__/svgMock.js',
    '^@network-international/react-native-ngenius$': '<rootDir>/index.js',
  },
  testMatch: ['<rootDir>/src/**/*.test.js'],
  transform: {
    '^.+\\.js$': ['babel-jest', {
      babelrc: false,
      configFile: false,
      plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'],
    }],
  },
};
