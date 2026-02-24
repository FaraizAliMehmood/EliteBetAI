import './global.css';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Platform, View, ScrollView, StatusBar } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import { AppView, Match, SavedPrediction } from './src/types';
import Dashboard from './src/components/Dashboard';
import AnalysisView from './src/components/AnalysisView';
import Navigation from './src/components/Navigation';
import HistoryView from './src/components/HistoryView';
import ScanView from './src/components/ScanView';
import SettingsView from './src/components/SettingsView';
import Onboarding from './src/components/OnBoarding';
import { translations, LanguageCode } from './src/translations';
import { GoogleGenAI, Type } from "@google/genai";
import { triggerHaptic } from './src/utils/haptics';

import Matches from './src/components/Matches';
import { syncSubscriptionFromRevenueCat } from './src/utils/subscription';

const DAILY_PICKS_KEY = 'elitebet_daily_picks_v3';
const SAVED_PREDICTIONS_KEY = 'elitebet_saved_v2';

// RevenueCat API key – replace with your key from https://app.revenuecat.com
// Use same public key for iOS and Android, or use Platform.OS to pick platform-specific key
const REVENUECAT_API_KEY = Platform.select({
  ios: 'appl_xyyLQAsDnOeXhPMxoDDVQGtmfYE',
  android: 'goog_lLGLgsXRTRlHsnhRceRecojcdVy',
  default: 'appl_xyyLQAsDnOeXhPMxoDDVQGtmfYE',
});

const AppContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [matchesInitialCategory, setMatchesInitialCategory] = useState('Football');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedFixtureId, setSelectedFixtureId] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [isPaywallActive, setIsPaywallActive] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [isMatchesLoading, setIsMatchesLoading] = useState(true);
  
  const [savedPredictions, setSavedPredictions] = useState<SavedPrediction[]>([]);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(true);
  const [language, setLanguage] = useState<LanguageCode>('en');
  
  const insets = useSafeAreaInsets();

  // Initialize RevenueCat and sync subscription status (source of truth)
  useEffect(() => {
    Purchases.configure({ apiKey: REVENUECAT_API_KEY });

    let listener: ((info: import('react-native-purchases').CustomerInfo) => void) | null = null;

    const runSync = async () => {
      const { isPro } = await syncSubscriptionFromRevenueCat();
      setIsPremiumState(isPro);
      setSubscriptionRefreshTrigger((t) => t + 1);
    };

    runSync();

    listener = () => {
      runSync();
    };
    Purchases.addCustomerInfoUpdateListener(listener);

    return () => {
      if (listener) Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  // Load initial state from AsyncStorage
  useEffect(() => {
    const loadInitialState = async () => {
      try {
        // Load saved predictions
        const saved = await AsyncStorage.getItem(SAVED_PREDICTIONS_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setSavedPredictions(parsed.map((p: any) => ({
              ...p,
              timestamp: new Date(p.timestamp)
            })));
          } catch (e) {
            console.error('Error parsing saved predictions:', e);
          }
        }

        // Load onboarding status
        const onboardingSeen = await AsyncStorage.getItem('elitebet_onboarding_seen');
        setShowOnboarding(onboardingSeen !== 'true');

        // Load language
        const lang = await AsyncStorage.getItem('elitebet_lang') as LanguageCode;
        if (lang && translations[lang]) {
          setLanguage(lang);
        }
      } catch (error) {
        console.error('Error loading initial state:', error);
      }
    };

    loadInitialState();
  }, []);
  
  const isPremium = useMemo(() => {
    // This will be updated when AsyncStorage loads
    return false; // Will be updated via effect
  }, []);

  // Check premium status
  useEffect(() => {
    const checkPremium = async () => {
      try {
        const proActive = await AsyncStorage.getItem('elitebet_pro_active');
        // Note: isPremium is a computed value, we'll need to use a state for this
      } catch (error) {
        console.error('Error checking premium:', error);
      }
    };
    checkPremium();
  }, [refreshTrigger, currentView]);

  const t = useCallback((key: string) => {
    return translations[language][key] || key;
  }, [language]);

  // Save predictions to AsyncStorage
  useEffect(() => {
    const savePredictions = async () => {
      try {
        await AsyncStorage.setItem(SAVED_PREDICTIONS_KEY, JSON.stringify(savedPredictions));
      } catch (error) {
        console.error('Error saving predictions:', error);
      }
    };
    savePredictions();
  }, [savedPredictions]);

  // Auto-update prediction status
  useEffect(() => {
    const timer = setInterval(() => {
      setSavedPredictions((current: SavedPrediction[]) => {
        let changed = false;
        const updated: SavedPrediction[] = current.map((p: SavedPrediction) => {
          if (p.status === 'pending' && (new Date().getTime() - p.timestamp.getTime() > 120000)) {
            changed = true;
            const isCorrect = Math.random() > 0.4;
            const status: 'correct' | 'incorrect' = isCorrect ? 'correct' : 'incorrect';
            
          
            
            return { ...p, status } as SavedPrediction;
          }
          return p;
        });
        return changed ? updated : current;
      });
    }, 15000);
    return () => clearInterval(timer);
  }, []);



  useEffect(() => {
    const updateLanguage = async () => {
      try {
        await AsyncStorage.setItem('elitebet_lang', language);
       
      } catch (error) {
        console.error('Error saving language:', error);
      }
    };
    updateLanguage();
  }, [language]);

  const handleSelectMatch = useCallback((fixtureId: number) => {
    setSelectedFixtureId(fixtureId);
    setSelectedMatch(null);
    setCurrentView(AppView.ANALYSIS);
  }, []);

  const handleSavePrediction = useCallback((prediction: SavedPrediction) => {
    setSavedPredictions(prev => [prediction, ...prev]);
    setCurrentView(AppView.SAVED);
  }, []);

  const handleDeletePrediction = useCallback((id: string) => {
    triggerHaptic('heavy');
    setSavedPredictions(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleMatchIdentified = useCallback((match: Match) => {
    setSelectedMatch(match);
    setSelectedFixtureId(null);
    setCurrentView(AppView.ANALYSIS);
  }, []);

  const handleCloseScan = useCallback(() => {
    setCurrentView(AppView.DASHBOARD);
  }, []);

  const handleOnboardingComplete = useCallback(async () => {
    try {
      await AsyncStorage.setItem('elitebet_onboarding_seen', 'true');
      setShowOnboarding(false);
    } catch (error) {
      console.error('Error saving onboarding status:', error);
    }
  }, []);

  const handleNavigate = useCallback((view: AppView) => {
    // Check premium status for SCAN view
    if (view === AppView.SCAN) {
      AsyncStorage.getItem('elitebet_pro_active').then((isPro) => {
        if (isPro !== 'true') {
          setIsPaywallActive(true);
          setCurrentView(AppView.SETTINGS);
          return;
        }
        setCurrentView(view);
      });
      return;
    }
    
    if (view === AppView.DASHBOARD && currentView === AppView.DASHBOARD) {
      setRefreshTrigger(prev => prev + 1);
    } else {
      if (view === AppView.DASHBOARD) {
        setMatchesInitialCategory('Football');
      }
      setCurrentView(view);
    }
  }, [currentView]);

  const showNavigation = useMemo(() => {
    return currentView !== AppView.ANALYSIS && currentView !== AppView.SCAN && !isPaywallActive && !showOnboarding;
  }, [currentView, isPaywallActive, showOnboarding]);

  const handleTriggerPremium = useCallback(() => {
    setIsPaywallActive(true);
    setCurrentView(AppView.SETTINGS);
  }, []);

  // Premium status: synced from RevenueCat on launch and when subscription changes (e.g. sandbox expiry)
  const [isPremiumState, setIsPremiumState] = useState(false);
  const [subscriptionRefreshTrigger, setSubscriptionRefreshTrigger] = useState(0);

  useEffect(() => {
    const checkPremium = async () => {
      try {
        const proActive = await AsyncStorage.getItem('elitebet_pro_active');
        setIsPremiumState(proActive === 'true');
      } catch (error) {
        console.error('Error checking premium:', error);
      }
    };
    checkPremium();
  }, [refreshTrigger, currentView, subscriptionRefreshTrigger]);

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <View className="flex-1 relative overflow-hidden bg-black">
        {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} t={t} />}

        {currentView === AppView.ANALYSIS && (selectedMatch || selectedFixtureId !== null) ? (
          <View className="flex-1 z-10">
            <AnalysisView 
              match={selectedMatch}
              fixtureId={selectedFixtureId ?? undefined}
              onSavePrediction={handleSavePrediction}
              onBack={() => {
                setMatchesInitialCategory('Football');
                setCurrentView(AppView.DASHBOARD);
                setSelectedMatch(null);
                setSelectedFixtureId(null);
              }}
              t={t}
              language={language}
            />
          </View>
        ) : (
          <ScrollView 
            className="flex-1 z-10"
            contentContainerStyle={{
              paddingTop: insets.top + 20,
              paddingBottom: insets.bottom + 100,
              paddingHorizontal: currentView === AppView.SCAN || currentView === AppView.DASHBOARD ? 0 : 24,
            }}
            showsVerticalScrollIndicator={false}
          >
            {currentView === AppView.DASHBOARD && (
              <View
                style={{
                  flex: 1,
                }}
              >
                <Matches
                  onSelectMatch={handleSelectMatch}
                  refreshTrigger={refreshTrigger}
                  t={t}
                  isPremium={isPremiumState}
                  onTriggerPremium={handleTriggerPremium}
                  initialCategory={matchesInitialCategory}
                />
              </View>
            )}
            {currentView === AppView.SCAN && isPremiumState && (
              <ScanView
                onMatchIdentified={handleMatchIdentified}
                onSelectFixture={handleSelectMatch}
                onClose={handleCloseScan}
                t={t}
                language={language}
              />
            )}
            {currentView === AppView.SAVED && (
              <HistoryView 
                history={savedPredictions} 
                onDelete={handleDeletePrediction}
                t={t}
              />
            )}
            {currentView === AppView.SETTINGS && (
              <SettingsView 
                key={language}
                language={language} 
                setLanguage={setLanguage} 
                t={t} 
                onPaywallToggle={setIsPaywallActive}
                forcePaywall={isPaywallActive}
                subscriptionRefreshTrigger={subscriptionRefreshTrigger}
              />
            )}
          </ScrollView>
        )}

        {showNavigation && (
          <Navigation currentView={currentView} setView={handleNavigate} t={t} />
        )}
      </View>
    </>
  );
};

const App: React.FC = () => {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
};

export default App;
