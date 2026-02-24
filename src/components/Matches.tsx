import React, { useState, useMemo, useEffect, useRef, memo, useCallback } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Animated, Keyboard, Platform, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Svg, { Path } from 'react-native-svg';
import { FootballMatch } from '../types';
import TeamLogo from './TeamLogo';
import { triggerHaptic } from '../utils/haptics';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY_FOOTBALL = 'elitebet_matches_football';
const CACHE_KEY_PREMIUM = 'elitebet_matches_premium';

const LEAGUE_GROUPS = [
  {
    title: 'GLOBAL & UEFA TOP',
    leagues: [
      { id: 39, label: 'Premier League' },
      { id: 140, label: 'La Liga' },
      { id: 135, label: 'Serie A' },
      { id: 78, label: 'Bundesliga' },
      { id: 61, label: 'Ligue 1' },
      { id: 2, label: 'Champions League' },
      { id: 3, label: 'Europa League' },
      { id: 848, label: 'Europa Conference League' },
    ],
  },
  {
    title: 'INTERNATIONAL (FIFA & CONFEDERATIONS)',
    leagues: [
      { id: 1, label: 'FIFA World Cup' },
      { id: 4, label: 'UEFA Euro' },
      { id: 9, label: 'Copa América' },
      { id: 6, label: 'Africa Cup of Nations – AFCON' },
      { id: 17, label: 'AFC Asian Cup' },
      { id: 7, label: 'CONCACAF Gold Cup' },
      { id: 5, label: 'UEFA Nations League' },
      { id: 15, label: 'FIFA Club World Cup' },
      { id: 28, label: 'Olympic Games' },
    ],
  },
  {
    title: 'REGIONAL CLUB COMPETITIONS — UEFA',
    leagues: [
      { id: 531, label: 'UEFA Super Cup' },
      { id: 36, label: 'Youth League' },
    ],
  },
  {
    title: 'REGIONAL CLUB COMPETITIONS — CAF',
    leagues: [
      { id: 12, label: 'CAF Champions League' },
      { id: 20, label: 'CAF Confederation Cup' },
    ],
  },
  {
    title: 'REGIONAL CLUB COMPETITIONS — CONMEBOL',
    leagues: [
      { id: 13, label: 'Copa Libertadores' },
      { id: 11, label: 'Copa Sudamericana' },
    ],
  },
  {
    title: 'REGIONAL CLUB COMPETITIONS — AFC',
    leagues: [
      { id: 16, label: 'AFC Champions League' },
    ],
  },
  {
    title: 'REGIONAL CLUB COMPETITIONS — CONCACAF',
    leagues: [
      { id: 222, label: 'CONCACAF Champions Cup' },
    ],
  },
  {
    title: 'AFRICA — TOP DOMESTIC LEAGUES',
    leagues: [
      { id: 332, label: 'Nigeria NPFL' },
      { id: 233, label: 'Egypt Premier League' },
      { id: 200, label: 'Morocco Botola Pro' },
      { id: 202, label: 'Tunisia Ligue 1' },
      { id: 186, label: 'Algeria Ligue 1' },
      { id: 288, label: 'South Africa PSL' },
      { id: 351, label: 'Ghana Premier League' },
      { id: 350, label: 'Kenya Premier League' },
    ],
  },
  {
    title: 'AMERICAS — TOP DOMESTIC LEAGUES',
    leagues: [
      { id: 886, label: 'MLS' },
      { id: 262, label: 'Liga MX' },
      { id: 71, label: 'Brazil Serie A' },
      { id: 128, label: 'Argentina Primera División' },
      { id: 265, label: 'Chile Primera División' },
      { id: 239, label: 'Colombia Primera A' },
      { id: 268, label: 'Uruguay Primera División' },
      { id: 281, label: 'Peru Liga 1' },
    ],
  },
  {
    title: 'ASIA — TOP DOMESTIC LEAGUES',
    leagues: [
      { id: 98, label: 'J1 League Japan' },
      { id: 292, label: 'K League 1' },
      { id: 169, label: 'Chinese Super League' },
      { id: 323, label: 'Indian Super League' },
      { id: 305, label: 'Qatar Stars League' },
      { id: 301, label: 'UAE Pro League' },
      { id: 307, label: 'Saudi Pro League' }

    ],
  },
  {
    title: 'EUROPE — STRONG SECONDARY LEAGUES',
    leagues: [
      { id: 88, label: 'Eredivisie' },
      { id: 94, label: 'Primeira Liga' },
      { id: 179, label: 'Scottish Premiership' },
      { id: 1078, label: 'Championship' },
      { id: 106, label: 'Ekstraklasa' },
      { id: 103, label: 'Eliteserien' },
      { id: 119, label: 'Danish Superliga' },
      { id: 362, label: 'A-League' },
      { id: 203, label: 'Süper Lig' },
    ],
  },
] as const;

const PREMIUM_LEAGUES = LEAGUE_GROUPS.flatMap((g) => g.leagues);


/** Start of today in local time — user cannot select yesterday or past dates */
function getTodayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** End of the 7th day from today — user can select today through today + 6 (next 7 days) */
function getMaxPremiumDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Returns date as YYYY-MM-DD for premium search API `today` param */
function formatDateForApi(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}


interface MatchesProps {
  onSelectMatch: (fixtureId: number) => void;
  refreshTrigger?: number;
  t: (key: string) => string;
  isPremium: boolean;
  onTriggerPremium: () => void;
  initialCategory?: string;
}

const FootballMatchCard = memo(({ match, onSelect, t, advice }: { match: FootballMatch; onSelect: (fixtureId: number) => void; t: (key: string) => string; advice?: string | null }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const { fixture, league, teams } = match;

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
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
    if (typeof onSelect === 'function') onSelect(fixture.id);
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
              {league.name}
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
                <View className="bg-[#007AFF]/10 border border-[#007AFF]/20 rounded-[10px] p-2 flex-row items-center gap-1.5">
                  <Svg width={20} height={18} viewBox="0 0 20 20" fill="#007AFF">
                    <Path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2z" />
                  </Svg>
                  <Text className="text-[12px] font-semibold text-[#007AFF] flex-1">{t('AI Prediction')}: {advice}</Text>
                </View>
              ) : <View className="bg-[#007AFF]/10 border border-[#007AFF]/20 rounded-[10px] p-2 flex-row items-center gap-1.5">
              <Svg width={20} height={18} viewBox="0 0 20 20" fill="#007AFF">
                <Path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2z" />
              </Svg>
              <Text className="text-[12px] font-semibold text-[#007AFF] flex-1">{t('AI Prediction')}: Data not available</Text>
            </View>}
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

const Matches: React.FC<MatchesProps> = ({ onSelectMatch, refreshTrigger = 0, t, isPremium, onTriggerPremium, initialCategory }) => {
  const [activeCategory, setActiveCategory] = useState(initialCategory ?? 'Football');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [footballDailyMatches, setFootballDailyMatches] = useState<FootballMatch[]>([]);
  const [isFootballLoading, setIsFootballLoading] = useState(true);
  const [footballError, setFootballError] = useState<string | null>(null);
  const [premiumMatches, setPremiumMatches] = useState<FootballMatch[]>([]);
  const [isPremiumLoading, setIsPremiumLoading] = useState(true);
  const [premiumError, setPremiumError] = useState<string | null>(null);
  const [predictionAdviceByFixtureId, setPredictionAdviceByFixtureId] = useState<Record<number, string>>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [premiumSearchDate, setPremiumSearchDate] = useState<Date>(getTodayStart());
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const [isLeaguePickerOpen, setIsLeaguePickerOpen] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<'weekly' | 'monthly' | 'yearly' | null>(null);

  const searchInputRef = useRef<TextInput>(null);
  const lastTriggerRef = useRef(refreshTrigger);
  const footballApiMatchesRef = useRef<FootballMatch[]>([]);
  const premiumApiMatchesRef = useRef<FootballMatch[]>([]);
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
    if (initialCategory && initialCategory !== activeCategory) {
      setActiveCategory(initialCategory);
    }
  }, [initialCategory, activeCategory]);

  // Load current subscription plan (shared with SettingsView)
  useEffect(() => {
    const loadPlan = async () => {
      try {
        const storedPlan = await AsyncStorage.getItem('elitebet_current_plan');
        if (storedPlan === 'weekly' || storedPlan === 'monthly' || storedPlan === 'yearly') {
          setCurrentPlan(storedPlan);
        }
      } catch (e) {
        console.error('Failed to load current plan for header:', e);
      }
    };
    loadPlan();
  }, []);

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

      // Try load from cache first
      try {
        const cachedRaw = await AsyncStorage.getItem(CACHE_KEY_FOOTBALL);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw) as { timestamp: number; matches: FootballMatch[]; adviceByFixtureId: Record<number, string> };
          const age = Date.now() - cached.timestamp;
          if (age < CACHE_TTL_MS && Array.isArray(cached.matches) && cached.matches.length > 0) {
            footballApiMatchesRef.current = cached.matches;
            setFootballDailyMatches(cached.matches);
            setPredictionAdviceByFixtureId((prev) => ({ ...prev, ...cached.adviceByFixtureId }));
            setIsFootballLoading(false);
            return;
          }
        }
      } catch {
        // ignore cache read errors, fall through to API
      }

      const response = await fetch('https://api-7ourym2t2q-uc.a.run.app/football', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const raw = data?.data?.response ?? data?.data;
      const list: FootballMatch[] = Array.isArray(raw) ? raw.slice(0, 4) : [];
      footballApiMatchesRef.current = list;
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
      setPredictionAdviceByFixtureId((prev) => ({ ...prev, ...byId }));

      // Save to cache
      try {
        await AsyncStorage.setItem(CACHE_KEY_FOOTBALL, JSON.stringify({
          timestamp: Date.now(),
          matches: list,
          adviceByFixtureId: byId,
        }));
      } catch {
        // ignore cache write errors
      }
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

  const fetchPremiumSearch = useCallback(async (dateOverride?: Date) => {
    try {
      setIsPremiumLoading(true);
      setPremiumError(null);

      const dateToUse = dateOverride ?? premiumSearchDate;
      const todayParam = formatDateForApi(dateToUse);

      // Try load from cache first (only use all-leagues cache, not league-filtered)
      try {
        const cachedRaw = await AsyncStorage.getItem(CACHE_KEY_PREMIUM);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw) as {
            timestamp: number;
            date: string;
            league?: number;
            matches: FootballMatch[];
            adviceByFixtureId: Record<number, string>;
          };
          const age = Date.now() - cached.timestamp;
          const isAllLeaguesCache = cached.league === undefined;
          if (age < CACHE_TTL_MS && cached.date === todayParam && Array.isArray(cached.matches) && isAllLeaguesCache) {
            premiumApiMatchesRef.current = cached.matches;
            setPremiumMatches(cached.matches);
            setSelectedLeagueId(null);
            setPredictionAdviceByFixtureId((prev) => ({ ...prev, ...cached.adviceByFixtureId }));
            setIsPremiumLoading(false);
            return;
          }
        }
      } catch {
        // ignore cache read errors, fall through to API
      }

      const response = await fetch(`https://api-7ourym2t2q-uc.a.run.app/premiumSearch?today=${encodeURIComponent(todayParam)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const list: FootballMatch[] = Array.isArray(data?.data) ? data.data : [];
      premiumApiMatchesRef.current = list;
      setPremiumMatches(list);
      setSelectedLeagueId(null);

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
      setPredictionAdviceByFixtureId((prev) => ({ ...prev, ...byId }));

      // Save to cache (no league = all leagues)
      try {
        await AsyncStorage.setItem(CACHE_KEY_PREMIUM, JSON.stringify({
          timestamp: Date.now(),
          date: todayParam,
          matches: list,
          adviceByFixtureId: byId,
        }));
      } catch {
        // ignore cache write errors
      }
    } catch (error: any) {
      console.error('Failed to load premium search matches', error);
      const isNetworkError = error?.message === 'Network request failed' || error?.name === 'TypeError';
      setPremiumError(
        isNetworkError
          ? 'Network error. Check your connection and try again.'
          : 'Failed to load premium matches.'
      );
    } finally {
      setIsPremiumLoading(false);
    }
  }, [fetchPredictionAdvice, premiumSearchDate]);

  const fetchPremiumSearchWithLeague = useCallback(
    async (leagueId: number, dateOverride?: Date) => {
      try {
        setIsPremiumLoading(true);
        setPremiumError(null);

        const dateToUse = dateOverride ?? premiumSearchDate;
        const todayParam = formatDateForApi(dateToUse);

        // Clear existing premium cache before league-specific search
        try {
          await AsyncStorage.removeItem(CACHE_KEY_PREMIUM);
        } catch {
          // ignore cache clear errors
        }
        premiumApiMatchesRef.current = [];
        setPremiumMatches([]);

        const response = await fetch(
          `https://api-7ourym2t2q-uc.a.run.app/premiumSearchWithLeague?today=${encodeURIComponent(
            todayParam
          )}&league=${leagueId}`,
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const list: FootballMatch[] = Array.isArray(data?.data) ? data.data : [];
        premiumApiMatchesRef.current = list;
        setPremiumMatches(list);

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
        setPredictionAdviceByFixtureId((prev) => ({ ...prev, ...byId }));

        // Store league-filtered premium results in cache
        try {
          await AsyncStorage.setItem(
            CACHE_KEY_PREMIUM,
            JSON.stringify({
              timestamp: Date.now(),
              date: todayParam,
              league: leagueId,
              matches: list,
              adviceByFixtureId: byId,
            })
          );
        } catch {
          // ignore cache write errors
        }
      } catch (error: any) {
        console.error('Failed to load premium search matches with league', error);
        const isNetworkError =
          error?.message === 'Network request failed' || error?.name === 'TypeError';
        setPremiumError(
          isNetworkError
            ? 'Network error. Check your connection and try again.'
            : 'Failed to load premium matches.'
        );
      } finally {
        setIsPremiumLoading(false);
      }
    },
    [fetchPredictionAdvice, premiumSearchDate]
  );

  // When Matches page is open, call both APIs
  useEffect(() => {
    fetchFootballDailyMatches();
    fetchPremiumSearch();
  }, [fetchFootballDailyMatches, fetchPremiumSearch]);

  const filteredFootballMatches = useMemo(() => {
    if (!searchQuery.trim()) return footballDailyMatches;
    const query = searchQuery.trim().toLowerCase();
    return footballDailyMatches.filter((m) => {
      const homeName = m.teams?.home?.name ?? '';
      const awayName = m.teams?.away?.name ?? '';
      const leagueName = m.league?.name ?? '';
      return (
        homeName.toLowerCase().includes(query) ||
        awayName.toLowerCase().includes(query) ||
        leagueName.toLowerCase().includes(query)
      );
    });
  }, [footballDailyMatches, searchQuery]);

  const filteredPremiumMatches = useMemo(() => {
    const bySearch = !searchQuery.trim()
      ? premiumMatches
      : premiumMatches.filter((m) => {
          const homeName = m.teams?.home?.name ?? '';
          const awayName = m.teams?.away?.name ?? '';
          const leagueName = m.league?.name ?? '';
          const query = searchQuery.trim().toLowerCase();
          return (
            homeName.toLowerCase().includes(query) ||
            awayName.toLowerCase().includes(query) ||
            leagueName.toLowerCase().includes(query)
          );
        });

    if (!selectedLeagueId) return bySearch;

    return bySearch.filter((m) => m.league?.id === selectedLeagueId);
  }, [premiumMatches, searchQuery, selectedLeagueId]);

  // Treat premium users as being in "premium search mode" so the date picker always shows for them
  const isPremiumSearchMode = isPremium;
  const displayMatches = isPremiumSearchMode ? filteredPremiumMatches : filteredFootballMatches;
  const displayFootballLoading = isPremiumSearchMode ? isPremiumLoading : isFootballLoading;
  const displayCount = displayMatches.length;
  const displayError = isPremiumSearchMode ? premiumError : footballError;

  const toggleSearch = useCallback(() => {
    triggerHaptic('selection');
    if (isSearching) {
      setSearchQuery('');
      // When closing search: restore both tabs' API data instantly (same logic for Top Picks and Football)
      if (footballApiMatchesRef.current.length > 0) {
        setFootballDailyMatches([...footballApiMatchesRef.current]);
      }
      if (premiumApiMatchesRef.current.length > 0) {
        setPremiumMatches([...premiumApiMatchesRef.current]);
      }
      setIsSearching(false);
      return;
    }
    // When opening search: if premium, show premium API response instantly for both tabs
    if (isPremium) {
      if (premiumApiMatchesRef.current.length > 0) {
        setPremiumMatches([...premiumApiMatchesRef.current]);
        setFootballDailyMatches([...premiumApiMatchesRef.current]);
      } else if (premiumMatches.length > 0) {
        setFootballDailyMatches([...premiumMatches]);
      }
    }
    setIsSearching(true);
  }, [isSearching, isPremium, premiumMatches]);

  const handleSearchSubmit = () => {
    Keyboard.dismiss();
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


  const CalendarIcon = ({ size = 18, color = '#007AFF' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </Svg>
  );

  const onDatePickerChange = async (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      setPremiumSearchDate(startOfDay);
      triggerHaptic('light');
      // No API calls here – date alone should not refetch
      if (Platform.OS === 'ios') setShowDatePicker(false);
    }
  };

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
              <View className="flex-1 mr-3">
                <View className="flex-row items-center">
                  <Text className="text-[28px] font-bold tracking-tight text-white leading-tight">
                    {t('elitebetAI').split(' ')[0]}{' '}
                    <Text className="text-[#007AFF] font-extrabold">
                      {t('elitebetAI').split(' ')[1]}
                    </Text>
                  </Text>
                  {/* Current plan badge (reads same storage as SettingsView) */}
                  {currentPlan && (
                    <View className="flex-row items-center gap-1 mx-2">
                      <View className="bg-amber-400 px-1.5 py-0.5 rounded-[6px]">
                        <Text className="text-black text-[9px] font-black tracking-wider">
                         PRO
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
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

          {/* Date & league filters when premium search: only today or future dates */}
          {isPremiumSearchMode && (
            <View className="px-4 flex-row items-center gap-2 mt-1">
              {/* Date */}
              <View className="flex-1">
                <Text className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider mb-1">
                  {t('date') || 'Date'}
                </Text>
                <Pressable
                  onPress={() => {
                    triggerHaptic('light');
                    setShowDatePicker(true);
                  }}
                  className="flex-row items-center gap-2 bg-[#1a1a1a] border border-white/10 rounded-xl px-3 py-2.5"
                >
                  <CalendarIcon size={18} />
                  <Text className="text-[13px] font-medium text-white" numberOfLines={1}>
                    {premiumSearchDate.toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                </Pressable>
              </View>

              {/* League dropdown */}
              <View className="flex-1">
                <Text className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider mb-1">
                  {t('league') || 'League'}
                </Text>
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    setIsLeaguePickerOpen(true);
                  }}
                  className="flex-row items-center justify-between bg-[#1a1a1a] border border-white/10 rounded-xl px-3 py-2.5"
                >
                  <Text className="text-[13px] font-medium text-white" numberOfLines={1}>
                    {selectedLeagueId
                      ? PREMIUM_LEAGUES.find((l) => l.id === selectedLeagueId)?.label ?? (t('league') || 'League')
                      : t('allLeagues') || 'All Leagues'}
                  </Text>
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth={2}>
                    <Path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                  </Svg>
                </Pressable>
              </View>
            </View>
          )}

          {/* League dropdown modal (grouped by category) */}
          <Modal
            visible={isLeaguePickerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setIsLeaguePickerOpen(false)}
          >
            <View className="flex-1 justify-end">
              <Pressable
                className="absolute inset-0 bg-black/60"
                onPress={() => setIsLeaguePickerOpen(false)}
              />
              <View className="bg-[#111111] rounded-t-3xl p-4 pb-8 border-t border-white/10">
                <Text className="text-center text-[13px] font-semibold text-[#8e8e93] mb-3">
                  {t('selectLeague') || 'Select league'}
                </Text>

                <ScrollView className="max-h-72">
                  {/* All leagues option */}
                  <Pressable
                    onPress={() => {
                      triggerHaptic('light');
                      setSelectedLeagueId(null);
                      setIsLeaguePickerOpen(false);
                      fetchPremiumSearch();
                    }}
                    className="flex-row items-center justify-between px-3 py-2.5 rounded-xl mb-2 bg-[#1a1a1a]"
                  >
                    <Text className="text-[14px] font-medium text-white">
                      {t('allLeagues') || 'All Leagues'}
                    </Text>
                    {selectedLeagueId === null && (
                      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#007AFF" strokeWidth={2}>
                        <Path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </Svg>
                    )}
                  </Pressable>

                  {LEAGUE_GROUPS.map((group) => (
                    <View key={group.title} className="mb-3">
                      <Text className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider mb-1">
                        {group.title}
                      </Text>
                      {group.leagues.map((league) => {
                        const isActive = selectedLeagueId === league.id;
                        return (
                          <Pressable
                            key={league.id}
                            onPress={() => {
                              triggerHaptic('light');
                              setSelectedLeagueId(league.id);
                              setIsLeaguePickerOpen(false);
                              // Load matches for this league and current date
                              fetchPremiumSearchWithLeague(league.id);
                            }}
                            className="flex-row items-center justify-between px-3 py-2.5 rounded-xl mb-1 bg-[#1a1a1a]"
                          >
                            <Text className="text-[14px] font-medium text-white">
                              {`${league.label} (${league.id})`}
                            </Text>
                            {isActive && (
                              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#007AFF" strokeWidth={2}>
                                <Path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </Svg>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>

            {showDatePicker && (
              <DateTimePicker
                value={premiumSearchDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={getTodayStart()}
                maximumDate={getMaxPremiumDate()}
                onChange={onDatePickerChange}
                {...(Platform.OS === 'ios' && {
                  textColor: '#FFFFFF',
                  themeVariant: 'dark',
                })}
              />
            )}

          {/* Matches List - API data only */}
          <View className="flex-col gap-4 pb-4 ">
            <View className="flex-row justify-between items-center px-4">
              <Text className="text-[11px] font-bold uppercase tracking-widest text-[#8e8e93]">
                {searchQuery ? `${t('scan')}: ${searchQuery}` : `${activeCategory === 'Top Picks' ? t('topPicks') : t('football')} ${t('trends')}`}
              </Text>
              {(activeCategory === 'Top Picks' || activeCategory === 'Football') && !displayFootballLoading && (
                <View className="bg-[#007AFF]/10 px-2 py-0.5 rounded-full">
                  <Text className="text-[9px] font-bold text-[#007AFF] tracking-wider">
                    {displayCount} {t('matches')}
                  </Text>
                </View>
              )}
            </View>

            {activeCategory === 'Top Picks' || activeCategory === 'Football' ? (
              <View className="px-4 mt-2">
                {displayFootballLoading ? (
                  <View className="flex-col gap-3">
                    {[1, 2, 3].map(i => <CardSkeleton key={i} />)}
                  </View>
                ) : displayError ? (
                  <View className="gap-3 py-4">
                    <Text className="text-[12px] text-red-400">{displayError}</Text>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('light');
                        if (isPremiumSearchMode) fetchPremiumSearch();
                        else fetchFootballDailyMatches();
                      }}
                      className="self-center bg-[#007AFF] px-4 py-2 rounded-xl"
                    >
                      <Text className="text-[13px] font-semibold text-white">Retry</Text>
                    </Pressable>
                  </View>
                ) : displayMatches.length > 0 ? (
                  <View className="flex-col gap-3">
                    {displayMatches.map((match) => (
                      <View key={match.fixture.id} className="mb-1">
                        <FootballMatchCard match={match} onSelect={onSelectMatch} t={t} advice={predictionAdviceByFixtureId[match.fixture.id]} />
                      </View>
                    ))}
                    {!isPremium && (
                      <View className="rounded-[22px] p-6 flex flex-col items-center justify-center gap-4 bg-[#1a1a1a] border border-[#0A84FF] overflow-hidden">
                        <View className="w-20 h-20 rounded-full bg-blue-500/20 items-center justify-center">
                          <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" className="text-[#0A84FF]">
                            <Path d="M12 2L15 8L22 9L17 14L18 21L12 18L6 21L7 14L2 9L9 8L12 2Z" fill="#0A84FF" />
                          </Svg>
                        </View>
                        <Text className="text-[14px] font-semibold text-white text-center">
                        Upgrade your plan to unlock more matches and AI predictions.
                        </Text>
                        <Pressable
                          onPress={() => {
                            triggerHaptic('light');
                            onTriggerPremium();
                          }}
                          className="bg-[#0A84FF] px-6 py-3 rounded-xl active:opacity-90"
                        >
                          <Text className="text-[15px] font-bold text-white">Upgrade Plan</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                ) : (
                  <View className="py-16 items-center glass rounded-[28px] border-white/10 opacity-50">
                    <Text className="text-[13px] font-normal tracking-tight text-white">
                      {searchQuery.trim() ? t('noTeamFound') : t('noAnalysis')}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View className="px-4 py-16 items-center glass rounded-[28px] border-white/10 opacity-50">
                <Text className="text-[13px] font-normal tracking-tight text-white">
                  No match found
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </Animated.View>
  );
};

export default memo(Matches);

