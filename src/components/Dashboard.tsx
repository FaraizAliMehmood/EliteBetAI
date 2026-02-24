import React, { useState, useMemo, useEffect, useRef, memo, useCallback } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Animated } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Match, FootballMatch } from '../types';
import TeamLogo from './TeamLogo';
import { triggerHaptic } from '../utils/haptics';

interface DashboardProps {
  matches: Match[];
  isLoading?: boolean;
  onSelectMatch: (fixtureId: number) => void;
  refreshTrigger?: number;
  t: (key: string) => string;
  isPremium: boolean;
  onTriggerPremium: () => void;
}

const FootballMatchCard = memo(({ match, onSelect, t, advice }: { match: FootballMatch; onSelect: (fixtureId: number) => void; t: (key: string) => string; advice?: string | null }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const { fixture, league, teams } = match;

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
  };
  const handlePress = () => {
    triggerHaptic('light');
    onSelect(fixture.id);
  };

  return (
    <Pressable onPress={handlePress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <View className="rounded-[22px] p-4 flex flex-col gap-4 bg-[#1a1a1a] border border-white/10 shadow-sm relative">
          <View className="flex-row justify-between items-center relative z-10">
            <Text className="text-[10px] font-semibold text-[#8e8e93] bg-white/5 px-2 py-0.5 rounded-[6px] tracking-wide uppercase">
              {formatDate(fixture.date)}
            </Text>
            <Text className="text-[10px] font-semibold text-[#8e8e93]">
              {league.name} • {league.season}
            </Text>
          </View>

          <View className="flex-row items-center justify-between px-1 relative z-10 mt-2">
            <View className="flex flex-col items-center gap-1.5 flex-1">
              <TeamLogo src={teams.home.logo} alt={teams.home.name} size="md" />
              <Text className="text-[13px] font-bold text-center tracking-tight text-white mt-1 leading-tight">
                {teams.home.name}
              </Text>
            </View>
            <View className="flex flex-col items-center">
              <Text className="text-[10px] font-black text-[#007AFF] tracking-[0.3em]">VS</Text>
            </View>
            <View className="flex flex-col items-center gap-1.5 flex-1">
              <TeamLogo src={teams.away.logo} alt={teams.away.name} size="md" />
              <Text className="text-[13px] font-bold text-center tracking-tight text-white mt-1 leading-tight">
                {teams.away.name}
              </Text>
            </View>
          </View>
            <View className="flex-col gap-1.5 mt-2">
              {advice ? (
                <View className="bg-[#007AFF]/10 border border-[#007AFF]/20 rounded-[10px] p-2">
                  <Text className="text-[10px] font-semibold text-[#007AFF]">{advice}</Text>
                </View>
              ) : null}
            </View>
          
        </View>
      </Animated.View>
    </Pressable>
  );
});

const CardSkeleton = () => {
  const pulseAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <Animated.View 
      className="glass rounded-[22px] p-4 flex flex-col bg-[#0a0a0b] gap-4 border border-white/10"
      style={{ opacity: pulseAnim }}
    >
      <View className="flex-row justify-between items-center">
        <View className="h-4 w-24 bg-white/5 rounded" />
        <View className="h-4 w-12 bg-white/5 rounded" />
      </View>
      <View className="flex-row items-center justify-between px-1">
        <View className="flex flex-col items-center gap-2 flex-1">
          <View className="w-14 h-14 rounded-full bg-white/5" />
          <View className="h-3 w-16 bg-white/5 rounded" />
        </View>
        <View className="h-4 w-8 bg-white/5 rounded" />
        <View className="flex flex-col items-center gap-2 flex-1">
          <View className="w-14 h-14 rounded-full bg-white/5" />
          <View className="h-3 w-16 bg-white/5 rounded" />
        </View>
      </View>
      <View className="h-10 w-full bg-white/5 rounded-[14px]" />
    </Animated.View>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ matches, isLoading, onSelectMatch, refreshTrigger = 0, t, isPremium, onTriggerPremium }) => {
  const CATEGORIES = useMemo(() => [
    { label: t('topPicks'), key: 'Top Picks' },
    { label: t('football'), key: 'Football' },
    { label: t('basketball'), key: 'Basketball' },
    { label: t('americanFootball'), key: 'American Football' },
    { label: t('tennis'), key: 'Tennis' },
    { label: t('mma'), key: 'MMA' }
  ], [t]);

  const [activeCategory, setActiveCategory] = useState('Top Picks');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [footballDailyMatches, setFootballDailyMatches] = useState<FootballMatch[]>([]);
  const [isFootballLoading, setIsFootballLoading] = useState(false);
  const [footballError, setFootballError] = useState<string | null>(null);
  const [predictionAdviceByFixtureId, setPredictionAdviceByFixtureId] = useState<Record<number, string>>({});
  
  const searchInputRef = useRef<TextInput>(null);
  const lastTriggerRef = useRef(refreshTrigger);
  const refreshOpacity = useRef(new Animated.Value(1)).current;
  const refreshScale = useRef(new Animated.Value(1)).current;

  const handleRefresh = useCallback(() => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    triggerHaptic('medium');
    
    Animated.parallel([
      Animated.timing(refreshOpacity, {
        toValue: 0.4,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(refreshScale, {
        toValue: 0.98,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(refreshOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(refreshScale, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      setIsRefreshing(false);
    }, 800);
  }, [isRefreshing, refreshOpacity, refreshScale]);

  useEffect(() => {
    if (refreshTrigger > lastTriggerRef.current) {
      handleRefresh();
    }
    lastTriggerRef.current = refreshTrigger;
  }, [refreshTrigger, handleRefresh]);

  useEffect(() => {
    if (isSearching && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isSearching]);

  const fetchPredictionAdvice = useCallback(async (fixtureId: number): Promise<string | null> => {
    try {
      const res = await fetch(`https://api-7ourym2t2q-uc.a.run.app/predict/${fixtureId}`);
      const json = await res.json();
      const advice = json?.data?.[0]?.predictions?.advice;
      return typeof advice === 'string' ? advice : null;
    } catch {
      return null;
    }
  }, []);

  const fetchFootballDailyMatches = useCallback(async () => {
    try {
      setIsFootballLoading(true);
      setFootballError(null);

      const response = await fetch('https://api-7ourym2t2q-uc.a.run.app/football', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const list: FootballMatch[] = Array.isArray(data?.data) ? data.data : [];
      setFootballDailyMatches(list);

      const results = await Promise.allSettled(
        list.map((m) => fetchPredictionAdvice(m.fixture.id))
      );
      const byId: Record<number, string> = {};
      list.forEach((m, i) => {
        const result = results[i];
        if (result.status === 'fulfilled' && result.value) {
          byId[m.fixture.id] = result.value;
        }
      });
      setPredictionAdviceByFixtureId(byId);
    } catch (error: any) {
      console.error('Failed to load football daily matches', error);
      const isNetworkError = error?.message === 'Network request failed' || error?.name === 'TypeError';
      setFootballError(
        isNetworkError
          ? 'Network error. Check your connection and try again.'
          : 'Failed to load football matches.'
      );
    } finally {
      setIsFootballLoading(false);
    }
  }, [fetchPredictionAdvice]);

  useEffect(() => {
    const shouldFetch = (activeCategory === 'Top Picks' || activeCategory === 'Football') && footballDailyMatches.length === 0 && !isFootballLoading;
    if (shouldFetch) {
      fetchFootballDailyMatches();
    }
  }, [activeCategory, footballDailyMatches.length, isFootballLoading, fetchFootballDailyMatches]);

  const filteredFootballMatches = useMemo(() => {
    if (!searchQuery.trim()) return footballDailyMatches;
    const query = searchQuery.toLowerCase();
    return footballDailyMatches.filter(
      (m) =>
        m.teams.home.name.toLowerCase().includes(query) ||
        m.teams.away.name.toLowerCase().includes(query) ||
        m.league.name.toLowerCase().includes(query)
    );
  }, [footballDailyMatches, searchQuery]);

  const toggleSearch = () => {
    triggerHaptic('selection');
    if (isSearching) {
      setSearchQuery('');
    }
    setIsSearching(!isSearching);
  };

  const handleSearchSubmit = () => {
    // Search filters API football matches via filteredFootballMatches
  };

  const SearchIcon = ({ size = 20, color = 'rgba(255, 255, 255, 0.7)' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </Svg>
  );

  const CloseIcon = ({ size = 20, color = '#007AFF' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </Svg>
  );

  return (
    <Animated.View 
      className="flex-1"
      style={{ 
        opacity: refreshOpacity,
        transform: [{ scale: refreshScale }]
      }}
    >
      <ScrollView 
        className="flex-1" 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        <View className="flex-col gap-6 pt-6">
          {/* Header */}
          <View className="flex-row justify-between items-center px-4 h-16">
            {isSearching ? (
              <View className="flex-1 flex-row items-center glass rounded-full px-4 h-12 border border-white/10 mx-4">
                <SearchIcon size={16} color="rgba(255, 255, 255, 0.4)" />
                <TextInput
                  ref={searchInputRef}
                  placeholder={t('searchPlaceholder')}
                  placeholderTextColor="rgba(255, 255, 255, 0.2)"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={handleSearchSubmit}
                  returnKeyType="search"
                  className="bg-transparent border-none outline-none text-white text-[15px] font-medium flex-1 ml-3"
                  style={{ color: 'white' }}
                />
              </View>
            ) : (
              <View>
                <Text className="text-[28px] font-bold tracking-tight text-white leading-tight">
                  {t('elitebetAI').split(' ')[0]}{' '}
                  <Text className="text-[#007AFF] font-extrabold">
                    {t('elitebetAI').split(' ')[1]}
                  </Text>
                </Text>
                <Text className="text-[#8e8e93] text-[13px] font-medium tracking-tight">
                  {t('predictiveIntel')}
                </Text>
              </View>
            )}
            
            <Pressable
              onPress={toggleSearch}
              className={`w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center shadow-sm ${isSearching ? 'bg-white/10 border-[#007AFF]/30' : ''}`}
            >
              {isSearching ? (
                <CloseIcon size={20} color="#007AFF" />
              ) : (
                <SearchIcon size={20} />
              )}
            </Pressable>
          </View>

          {/* Categories */}
          <View className="py-2">
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
            >
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat.key}
                  onPress={() => {
                    triggerHaptic('selection');
                    setActiveCategory(cat.key);
                  }}
                  className={`px-4 py-1.5 rounded-[12px] border ${activeCategory === cat.key ? 'bg-[#007AFF] border-[#007AFF]' : 'bg-white/5 border-white/10'}`}
                  style={activeCategory === cat.key ? { shadowColor: '#007AFF', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } } : {}}
                >
                  <Text className={`text-[13px] font-semibold tracking-tight ${activeCategory === cat.key ? 'text-white' : 'text-[#8e8e93]'}`}>
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Matches List - API data only */}
          <View className="flex-col gap-4 pb-4 ">
            <View className="flex-row justify-between items-center px-4">
              <Text className="text-[11px] font-bold uppercase tracking-widest text-[#8e8e93]">
                {searchQuery ? `${t('scan')}: ${searchQuery}` : `${CATEGORIES.find(c => c.key === activeCategory)?.label} ${t('trends')}`}
              </Text>
              {(activeCategory === 'Top Picks' || activeCategory === 'Football') && !isFootballLoading && (
                <View className="bg-[#007AFF]/10 px-2 py-0.5 rounded-full">
                  <Text className="text-[9px] font-bold text-[#007AFF] tracking-wider">
                    {filteredFootballMatches.length} {t('matches')}
                  </Text>
                </View>
              )}
            </View>

            {activeCategory === 'Top Picks' || activeCategory === 'Football' ? (
              <View className="px-4 mt-2">
                {isFootballLoading ? (
                  <View className="flex-col gap-3">
                    {[1, 2, 3].map(i => <CardSkeleton key={i} />)}
                  </View>
                ) : footballError ? (
                  <View className="gap-3 py-4">
                    <Text className="text-[12px] text-red-400">{footballError}</Text>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('light');
                        fetchFootballDailyMatches();
                      }}
                      className="self-center bg-[#007AFF] px-4 py-2 rounded-xl"
                    >
                      <Text className="text-[13px] font-semibold text-white">Retry</Text>
                    </Pressable>
                  </View>
                ) : filteredFootballMatches.length > 0 ? (
                  <View className="flex-col gap-3">
                    {filteredFootballMatches.map((match, index) => (
                      <View key={index} className="mb-1">
                        <FootballMatchCard match={match} onSelect={onSelectMatch} t={t} advice={predictionAdviceByFixtureId[match.fixture.id]} />
                      </View>
                    ))}
                  </View>
                ) : (
                  <View className="py-16 items-center glass rounded-[28px] border-white/10 opacity-50">
                    <Text className="text-[13px] font-normal tracking-tight text-white">
                      {t('noAnalysis')}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View className="px-4 py-16 items-center glass rounded-[28px] border-white/10 opacity-50">
                <Text className="text-[13px] font-normal tracking-tight text-white">
                  {t('noAnalysis')}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </Animated.View>
  );
};

export default memo(Dashboard);
