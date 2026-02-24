import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HAPTIC_OPTIONS = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

// Cache for haptics preference
let hapticsEnabledCache: boolean | null = null;
let isInitialized = false;

// Initialize cache on first call
const initializeCache = async () => {
  if (isInitialized) return;
  
  try {
    const hapticsSetting = await AsyncStorage.getItem('elitebet_haptics');
    hapticsEnabledCache = hapticsSetting !== 'false';
  } catch (error) {
    // Default to enabled if there's an error
    hapticsEnabledCache = true;
  }
  isInitialized = true;
};

/**
 * Triggers haptic feedback using React Native Haptic Feedback if enabled in settings.
 * Patterns mimic Apple's Taptic Engine feedback styles.
 */
export const triggerHaptic = (
  style: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error' = 'selection'
) => {
  // Initialize cache if not already done (non-blocking)
  if (!isInitialized) {
    initializeCache();
    // Default to enabled on first call while cache initializes
    if (hapticsEnabledCache === null) {
      hapticsEnabledCache = true;
    }
  }

  const isEnabled = hapticsEnabledCache !== false;
  
  if (!isEnabled) {
    return;
  }

  switch (style) {
    case 'light':
      ReactNativeHapticFeedback.trigger('impactLight', HAPTIC_OPTIONS);
      break;
    case 'medium':
      ReactNativeHapticFeedback.trigger('impactMedium', HAPTIC_OPTIONS);
      break;
    case 'heavy':
      ReactNativeHapticFeedback.trigger('impactHeavy', HAPTIC_OPTIONS);
      break;
    case 'selection':
      ReactNativeHapticFeedback.trigger('impactLight', HAPTIC_OPTIONS);
      break;
    case 'success':
      ReactNativeHapticFeedback.trigger('notificationSuccess', HAPTIC_OPTIONS);
      break;
    case 'warning':
      ReactNativeHapticFeedback.trigger('notificationWarning', HAPTIC_OPTIONS);
      break;
    case 'error':
      ReactNativeHapticFeedback.trigger('notificationError', HAPTIC_OPTIONS);
      break;
    default:
      ReactNativeHapticFeedback.trigger('impactMedium', HAPTIC_OPTIONS);
  }
};
