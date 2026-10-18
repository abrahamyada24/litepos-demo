module.exports = {
  preset: 'react-native',
  roots: ['<rootDir>/__tests__'],
  transformIgnorePatterns: [
    'node_modules/(?!((@)?react-native|@react-native(-community)?|@react-navigation|react-native-vector-icons|react-native-gesture-handler|react-native-reanimated)/)',
  ],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '<rootDir>/node_modules/@react-native-async-storage/async-storage/jest/async-storage-mock.js',
    '^@react-native-clipboard/clipboard$': '<rootDir>/node_modules/@react-native-clipboard/clipboard/jest/clipboard-mock.js',
  },
};
