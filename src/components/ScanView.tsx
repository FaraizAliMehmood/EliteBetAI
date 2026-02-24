import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AnimatedReanimated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { launchCamera, launchImageLibrary, ImagePickerResponse, MediaType } from 'react-native-image-picker';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { triggerHaptic } from '../utils/haptics';
import { Match, FootballMatch } from '../types';
import TeamLogo from './TeamLogo';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY_PREMIUM = 'elitebet_matches_premium';

interface ScanViewProps {
  onMatchIdentified: (match: Match) => void;
  /** When provided, opening the found match navigates with fixtureId so AnalysisView loads full data (same as Matches). */
  onSelectFixture?: (fixtureId: number) => void;
  onClose: () => void;
  t: (key: string) => string;
  language: string;
}

enum ScanPhase {
  INSTRUCTIONS = 'INSTRUCTIONS',
  CAPTURING = 'CAPTURING',
  ANALYZING = 'ANALYZING',
}

const GEMINI_KEY = 'AIzaSyCZz58i2UCDJWOms7D-AT5UzG0D7FIrKLU';

type GeminiMatch = {
  home: string;
  away: string;
  date: string; // "YYYY-MM-DD"
};

async function fetchPremiumMatches(): Promise<FootballMatch[]> {
  try {
    const cachedRaw = await AsyncStorage.getItem(CACHE_KEY_PREMIUM);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw) as {
        timestamp: number;
        matches: FootballMatch[];
        adviceByFixtureId: Record<number, string>;
      };
      const age = Date.now() - cached.timestamp;
      if (age < CACHE_TTL_MS && Array.isArray(cached.matches)) {
        return cached.matches;
      }
    }
    // Cache miss or stale: return empty (no API call)
    return [];
  } catch (error) {
    console.error('Failed to load premium matches for scan check', error);
    return [];
  }
}

function isSameDate(fixtureDateStr: string, targetDate: string): boolean {
  try {
    const d = new Date(fixtureDateStr);
    const iso = d.toISOString().slice(0, 10);
    return iso === targetDate;
  } catch {
    return false;
  }
}

async function findPremiumMatch(result: GeminiMatch): Promise<FootballMatch | null> {
  const premiumMatches = await fetchPremiumMatches();
  const list = premiumMatches ?? [];
  const targetHome = result.home.trim().toLowerCase();
  const targetAway = result.away.trim().toLowerCase();

  const found = list.find((m) => {
    const homeName = m.teams?.home?.name?.trim().toLowerCase() ?? '';
    const awayName = m.teams?.away?.name?.trim().toLowerCase() ?? '';
    // Match on team names only (date can differ slightly between APIs / screenshots)
    const homeMatch =
      homeName === targetHome ||
      homeName.includes(targetHome) ||
      targetHome.includes(homeName);
    const awayMatch =
      awayName === targetAway ||
      awayName.includes(targetAway) ||
      targetAway.includes(awayName);
    return homeMatch && awayMatch;
  });

  return found ?? null;
}

async function fetchPredictionAdvice(fixtureId: number): Promise<string | null> {
  try {
    const res = await fetch(`https://api-7ourym2t2q-uc.a.run.app/predict/${fixtureId}`);
    const json = await res.json();
    const advice = json?.data?.[0]?.predictions?.advice;
    return typeof advice === 'string' ? advice : null;
  } catch {
    return null;
  }
}

function extractJsonArray(text: string): string {
  // Removes markdown fences if Gemini adds them
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  // Extract the first JSON array found
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error('No JSON array found in Gemini response');
  }

  return match[0];
}

async function scanMatchWithGemini(
  base64Image: string
): Promise<GeminiMatch[]> {
  const prompt = `
Extract football matches from this image.

Return JSON ONLY in the following format:
[
  { "home": "string", "away": "string", "date": "YYYY-MM-DD" }
]

Do NOT include markdown, backticks, comments, or explanations.
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64Image,
                },
              },
            ],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Gemini request failed: ${response.status} ${text}`);
  }

  const data = await response.json();

  // ✅ Join ALL parts safely (Gemini may split text)
  const rawText =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text ?? '')
      .join('')
      .trim() ?? '[]';

  // 🔍 Optional but VERY useful for debugging
  console.log('Gemini raw output:', rawText);

  const jsonText = extractJsonArray(rawText);

  try {
    return JSON.parse(jsonText) as GeminiMatch[];
  } catch (err) {
    console.error('JSON parse failed:', jsonText);
    throw err;
  }
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = Math.min(280, SCREEN_WIDTH - 48);
const CARD_HEIGHT = CARD_WIDTH * 1.2;

const PaginationDot: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const animatedStyle = useAnimatedStyle(() => ({
    width: withTiming(isActive ? 20 : 4, { duration: 300 }),
  }));
  const analyzingSteps: string[] = [
    'Analyzing team statistics',
    'Generating tactical matrix',
    'Calculating signal strength',
    'Evaluating recent form',
    'Finalizing AI prediction',
  ];

  return (
    <AnimatedReanimated.View
      className="h-0.5 rounded-full"
      style={[
        animatedStyle,
        { backgroundColor: isActive ? '#007AFF' : 'rgba(255,255,255,0.1)' },
      ]}
    />
  );
};

interface StepSlideProps {
  step: { id: number; title: string; desc: string; icon: string };
  activeStepSV: ReturnType<typeof useSharedValue<number>>;
  isActive: boolean;
  children: React.ReactNode;
}

const StepSlide: React.FC<StepSlideProps> = ({ step, activeStepSV, isActive, children }) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const active = activeStepSV.value === step.id;
    return {
      opacity: withTiming(active ? 1 : 0, { duration: 300 }),
      transform: [
        { scale: withTiming(active ? 1 : 0.95, { duration: 300 }) },
        { translateY: withTiming(active ? 0 : 8, { duration: 300 }) },
      ],
    };
  });
  return (
    <AnimatedReanimated.View
      className="absolute inset-0 flex-col items-center justify-center"
      style={animatedStyle}
      pointerEvents={isActive ? 'auto' : 'none'}
    >
      {children}
    </AnimatedReanimated.View>
  );
};

const ScanView: React.FC<ScanViewProps> = ({ onMatchIdentified, onSelectFixture, onClose, t, language }) => {
  const [phase, setPhase] = useState<ScanPhase>(ScanPhase.INSTRUCTIONS);
  const [activeStep, setActiveStep] = useState(1);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [foundPremiumMatch, setFoundPremiumMatch] = useState<FootballMatch | null>(null);
  const [foundPremiumAdvice, setFoundPremiumAdvice] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const activeStepSV = useSharedValue(1);

  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    activeStepSV.value = activeStep;
  }, [activeStep, activeStepSV]);

  useEffect(() => {
    if (phase === ScanPhase.INSTRUCTIONS) {
      const timer = setInterval(() => {
        setActiveStep(prev => (prev % 3) + 1);
      }, 3000);
      return () => clearInterval(timer);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === ScanPhase.INSTRUCTIONS) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 4000,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
  }, [phase, scanLineAnim]);

  const handleCapture = () => {
    triggerHaptic('medium');
    launchCamera(
      {
        mediaType: 'photo' as MediaType,
        quality: 0.8,
        saveToPhotos: false,
        includeBase64: true,
      },
      (response: ImagePickerResponse) => {
        if (response.assets && response.assets[0]) {
          const base64 = response.assets[0].base64;
          if (base64) {
            processImage(base64);
          } else {
            triggerHaptic('error');
            setError('Failed to process image');
          }
        }
      }
    );
  };

  const handleUpload = () => {
    triggerHaptic('selection');
    launchImageLibrary(
      {
        mediaType: 'photo' as MediaType,
        quality: 0.8,
        includeBase64: true,
      },
      (response: ImagePickerResponse) => {
        if (response.assets && response.assets[0]) {
          const base64 = response.assets[0].base64;
          if (base64) {
            processImage(base64);
          } else {
            triggerHaptic('error');
            setError('Failed to process image');
          }
        }
      }
    );
  };

  const processImage = async (base64Data: string) => {
    setPhase(ScanPhase.ANALYZING);
    setAnalysisProgress(0);
    setFoundPremiumMatch(null);
    setFoundPremiumAdvice(null);

    const progressInterval = setInterval(() => {
      setAnalysisProgress(prev => Math.min(prev + Math.random() * 20, 95));
    }, 300);

    try {
      const matches = await scanMatchWithGemini(base64Data);

      clearInterval(progressInterval);
      setAnalysisProgress(100);
      triggerHaptic('success');

      const result = matches[0];
      if (result) {
        const found = await findPremiumMatch(result);
        if (found) {
          setFoundPremiumMatch(found);
          const advice = await fetchPredictionAdvice(found.fixture.id);
          setFoundPremiumAdvice(advice);
        }
      }
      setPhase(ScanPhase.INSTRUCTIONS);
    } catch (err) {
      console.log(err);
      clearInterval(progressInterval);
      triggerHaptic('error');
      setError('Unable to verify real-time data. Please ensure match info is clear.');
      setPhase(ScanPhase.INSTRUCTIONS);
    }
  };

  const handleScanAnother = () => {
    triggerHaptic('light');
    setFoundPremiumMatch(null);
    setFoundPremiumAdvice(null);
  };

  const handleOpenFoundMatch = () => {
    if (!foundPremiumMatch) return;
    triggerHaptic('light');
    const { fixture } = foundPremiumMatch;
    // Use fixtureId so AnalysisView fetches full data (predict, h2h, injuries, metrics) like Matches
    if (onSelectFixture) {
      onSelectFixture(fixture.id);
      return;
    }
    const { teams } = foundPremiumMatch;
    const formatDate = (dateStr: string) => {
      try {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      } catch {
        return dateStr;
      }
    };
    onMatchIdentified({
      id: fixture.id.toString(),
      sport: 'Football',
      homeTeam: teams.home.name,
      awayTeam: teams.away.name,
      homeLogo: teams.home.logo,
      awayLogo: teams.away.logo,
      time: formatDate(fixture.date),
      aiConfidence: 92,
      aiPrediction: foundPremiumAdvice ?? t('insights'),
    });
  };

  const analyzingSteps: string[] = [
    'Analyzing team statistics',
    'Generating tactical matrix',
    'Calculating signal strength',
    'Evaluating recent form',
    'Finalizing AI prediction',
  ];

  const steps = [
    {
      id: 1,
      title: t('identify'),
      desc: t('identifyDesc'),
      icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
    },
    {
      id: 2,
      title: t('snapshot'),
      desc: t('snapshotDesc'),
      icon: 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z',
    },
    {
      id: 3,
      title: t('insights'),
      desc: t('insightsDesc'),
      icon: 'M13 10V3L4 14h7v7l9-11h-7z',
    },
  ];

  // Use translateY instead of top - native driver only supports transform/opacity
  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, CARD_HEIGHT * 0.8],
  });

  const scanLineOpacity = scanLineAnim.interpolate({
    inputRange: [0, 0.1, 0.9, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Modal
      visible={true}
      animationType="fade"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View
        className="flex-1 bg-black"
        style={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        {/* Background effects */}
        <View className="absolute inset-0 pointer-events-none">
          <View
            className="absolute bg-blue-600/5 rounded-full"
            style={{
              width: SCREEN_WIDTH * 1.5,
              height: SCREEN_HEIGHT * 1.5,
              top: -SCREEN_HEIGHT * 0.25,
              left: -SCREEN_WIDTH * 0.25,
              opacity: 0.5,
            }}
          />
        </View>

        {/* Header */}
        <View className="px-6 pt-4 pb-4 flex-row justify-between items-center z-10">
          <View className="flex-col">
            <Text className="text-white text-[28px] font-semibold leading-[34px] tracking-[-0.41px]">
              {t('scanMatch')}
            </Text>
            <Text className="text-[9px] font-bold text-blue-500 uppercase tracking-widest opacity-80">
              {t('aiVisionMode')}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-9 h-9 rounded-full bg-glass-100 border border-white/10 flex items-center justify-center active:scale-90"
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={2.5}>
              <Path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </Svg>
          </Pressable>
        </View>

        {/* Main content */}
        <View className="flex-1 flex-col items-center justify-center px-6 z-10 relative">
          {phase === ScanPhase.ANALYZING ? (
            <View className="flex-col items-center w-full">
              {/* Circular progress */}
              <View className="relative w-40 h-40 mb-8">
                <Svg width={160} height={160} viewBox="0 0 128 128" style={{ transform: [{ rotate: '-90deg' }] }}>
                  <Circle
                    cx="64"
                    cy="64"
                    r="60"
                    fill="transparent"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="2.5"
                  />
                  <Circle
                    cx="64"
                    cy="64"
                    r="60"
                    fill="transparent"
                    stroke="#007AFF"
                    strokeWidth="2.5"
                    strokeDasharray="377"
                    strokeDashoffset={377 - (377 * analysisProgress) / 100}
                    strokeLinecap="round"
                  />
                </Svg>
                <View className="absolute inset-0 flex-col items-center justify-center">
                  <Text className="text-white text-[32px] font-semibold tabular-nums">
                    {Math.round(analysisProgress)}%
                  </Text>
                  <Text className="mt-1 text-[11px] font-semibold tracking-[0.2em] text-white/50 uppercase">
                    {t('readingData')}
                  </Text>
                </View>
                <View
                  className="absolute bg-blue-500/5 rounded-full blur-xl"
                  style={{
                    top: 8,
                    left: 8,
                    right: 8,
                    bottom: 8,
                  }}
                />
              </View>
              {/* Analyzing checklist */}
              <View className="w-full max-w-md rounded-[28px] bg-[#050509] border border-white/10 px-5 py-4">
                {analyzingSteps.map((label: string, index: number) => {
                  const completedThreshold = ((index + 1) / analyzingSteps.length) * 100;
                  const isCompleted = analysisProgress >= completedThreshold - 5; // slight lead
                  return (
                    <View
                      key={label}
                      className="flex-row items-center justify-between py-1.5"
                    >
                      <View className="flex-row items-center gap-2.5">
                        <View
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: isCompleted ? '#32D74B' : 'rgba(255,255,255,0.15)' }}
                        />
                        <Text
                          className="text-[11px] font-semibold"
                          style={{ color: isCompleted ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)' }}
                        >
                          {label.toUpperCase()}
                        </Text>
                      </View>
                      <View
                        className="w-4 h-4 rounded-full border flex items-center justify-center"
                        style={{
                          borderColor: isCompleted ? '#32D74B' : 'rgba(255,255,255,0.2)',
                          backgroundColor: isCompleted ? 'rgba(50,215,75,0.15)' : 'transparent',
                        }}
                      >
                        {isCompleted && (
                          <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#32D74B" strokeWidth={2.5}>
                            <Path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </Svg>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : foundPremiumMatch ? (
            <ScrollView
              className="flex-1 w-full"
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 24 }}
              showsVerticalScrollIndicator={false}
            >
              <Pressable onPress={handleOpenFoundMatch} className="mb-4">
                <View className="rounded-[22px] p-4 flex flex-col gap-4 bg-[#1a1a1a] border border-white/10 shadow-sm">
                  <View className="flex-row justify-between items-center">
                    <Text className="text-[10px] font-semibold text-[#8e8e93] bg-white/5 px-2 py-0.5 rounded-[6px] tracking-wide uppercase">
                      {(() => {
                        try {
                          return new Date(foundPremiumMatch.fixture.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                        } catch {
                          return foundPremiumMatch.fixture.date;
                        }
                      })()}
                    </Text>
                    <Text className="text-[10px] font-semibold text-[#8e8e93]">
                      {foundPremiumMatch.league.name} • {foundPremiumMatch.league.season}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between px-1 mt-2">
                    <View className="flex flex-col items-center gap-1.5 flex-1">
                      <TeamLogo src={foundPremiumMatch.teams.home.logo} alt={foundPremiumMatch.teams.home.name} size="md" />
                      <Text className="text-[13px] font-bold text-center tracking-tight text-white mt-1 leading-tight">
                        {foundPremiumMatch.teams.home.name}
                      </Text>
                    </View>
                    <View className="flex flex-col items-center">
                      <Text className="text-[10px] font-black text-[#007AFF] tracking-[0.3em]">VS</Text>
                    </View>
                    <View className="flex flex-col items-center gap-1.5 flex-1">
                      <TeamLogo src={foundPremiumMatch.teams.away.logo} alt={foundPremiumMatch.teams.away.name} size="md" />
                      <Text className="text-[13px] font-bold text-center tracking-tight text-white mt-1 leading-tight">
                        {foundPremiumMatch.teams.away.name}
                      </Text>
                    </View>
                  </View>
                  {foundPremiumAdvice ? (
                    <View className="bg-[#007AFF]/10 border border-[#007AFF]/20 rounded-[10px] p-2 flex-row items-center gap-1.5 mt-2">
                      <Svg width={20} height={18} viewBox="0 0 20 20" fill="#007AFF">
                        <Path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2z" />
                      </Svg>
                      <Text className="text-[12px] font-semibold text-[#007AFF] flex-1">{t('AI Prediction')}: {foundPremiumAdvice}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
              <Pressable
                onPress={handleScanAnother}
                className="w-full h-14 rounded-[22px] glass border border-white/10 flex-row items-center justify-center gap-2.5 active:scale-95"
              >
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={2}>
                  <Path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </Svg>
                <Text className="text-white font-bold text-[15px]">{t('scanMatch')} again</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <>
              <View
                className="relative glass-dark rounded-[32px] border border-white/5 shadow-2xl overflow-hidden mb-8"
                style={{
                  width: Math.min(280, SCREEN_WIDTH - 48),
                  aspectRatio: 1 / 1.2,
                }}
              >
                <View className="absolute inset-0 bg-blue-500/5" />
                <View
                  style={{
                    position: 'absolute',
                    top: 24,
                    left: 24,
                    width: 32,
                    height: 32,
                    borderTopWidth: 1,
                    borderLeftWidth: 1,
                    borderColor: 'rgba(59, 130, 246, 0.3)',
                    borderTopLeftRadius: 8,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    top: 24,
                    right: 24,
                    width: 32,
                    height: 32,
                    borderTopWidth: 1,
                    borderRightWidth: 1,
                    borderColor: 'rgba(59, 130, 246, 0.3)',
                    borderTopRightRadius: 8,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    bottom: 24,
                    left: 24,
                    width: 32,
                    height: 32,
                    borderBottomWidth: 1,
                    borderLeftWidth: 1,
                    borderColor: 'rgba(59, 130, 246, 0.3)',
                    borderBottomLeftRadius: 8,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    bottom: 24,
                    right: 24,
                    width: 32,
                    height: 32,
                    borderBottomWidth: 1,
                    borderRightWidth: 1,
                    borderColor: 'rgba(59, 130, 246, 0.3)',
                    borderBottomRightRadius: 8,
                  }}
                />
                <Animated.View
                  className="absolute left-0 right-0 bg-blue-400/30"
                  style={{
                    height: 1,
                    top: CARD_HEIGHT * 0.1,
                    opacity: scanLineOpacity,
                    transform: [{ translateY: scanLineTranslateY }],
                    shadowColor: '#007AFF',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 1,
                    shadowRadius: 4,
                  }}
                />
                <View className="absolute inset-0 flex items-center justify-center p-6">
                  {steps.map(step => (
                    <StepSlide
                      key={step.id}
                      step={step}
                      activeStepSV={activeStepSV}
                      isActive={activeStep === step.id}
                    >
                      <View className="w-10 h-10 rounded-2xl glass border border-white/10 flex items-center justify-center mb-3 shadow-lg">
                        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#007AFF" strokeWidth={1.5}>
                          <Path strokeLinecap="round" strokeLinejoin="round" d={step.icon} />
                        </Svg>
                      </View>
                      <Text className="text-white text-[15px] font-semibold mb-1">{step.title}</Text>
                      <Text className="text-white/30 text-[12px] text-center px-4 leading-tight">
                        {step.desc}
                      </Text>
                    </StepSlide>
                  ))}
                </View>
              </View>
              <View className="flex-row gap-1.5 mb-2">
                {steps.map(s => (
                  <PaginationDot key={s.id} isActive={activeStep === s.id} />
                ))}
              </View>
            </>
          )}
        </View>

        {/* Action buttons - hide when showing found match card */}
        {!foundPremiumMatch && (
        <Animated.View
          className="px-6 pb-6 pt-4 z-10 flex-col gap-3"
          style={{
            opacity: phase === ScanPhase.ANALYZING ? 0 : 1,
            transform: [{ translateY: phase === ScanPhase.ANALYZING ? 16 : 0 }],
          }}
        >
          <Pressable
            onPress={handleCapture}
            className="w-full h-16 rounded-[24px] bg-white flex-row items-center justify-center gap-3 active:scale-95 shadow-xl"
          >
            <View className="w-8 h-8 rounded-xl bg-black/5 flex items-center justify-center shrink-0">
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth={2.5}>
                <Path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <Path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </Svg>
            </View>
            <Text className="text-black font-bold text-[16px]">{t('takePhoto')}</Text>
          </Pressable>
          <Pressable
            onPress={handleUpload}
            className="w-full h-14 rounded-[22px] glass text-white font-bold text-[15px] border border-white/5 flex-row items-center justify-center gap-2.5 active:scale-95"
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={2}>
              <Path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </Svg>
            <Text className="text-white font-bold text-[15px]">{t('uploadPhoto')}</Text>
          </Pressable>
        </Animated.View>
        )}

        {/* Error message */}
        {error && (
          <View
            className="absolute bottom-32 left-6 right-6 z-[110]"
            style={{ paddingBottom: insets.bottom }}
          >
            <View className="glass-dark border border-red-500/20 px-4 py-3 rounded-2xl bg-red-500/5 flex-row items-center gap-3">
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth={2}>
                <Path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </Svg>
              <Text className="text-white/80 text-[13px] flex-1">{error}</Text>
              <Pressable
                onPress={() => {
                  triggerHaptic('light');
                  setError(null);
                }}
              >
                <Text className="text-white/40 font-bold text-lg">&times;</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

export default ScanView;
