module.exports = {
    dependencies: {
      'react-native-reanimated': {
        platforms: {
          ios: {
            scriptPhases: [], // 👈 Required for RN 0.84
          },
        },
      },
    },
  };
  