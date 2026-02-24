import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, Animated, Dimensions, ActivityIndicator, Image } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SavedPrediction } from '../types';
import { Match } from '../types';
import TeamLogo from './TeamLogo';
import { triggerHaptic } from '../utils/haptics';

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREDICT_API_BASE = 'https://api-7ourym2t2q-uc.a.run.app/predict';
const H2H_API_BASE = 'https://api-7ourym2t2q-uc.a.run.app/h2h';
const INJURIES_API_BASE = 'https://api-7ourym2t2q-uc.a.run.app/injuries';
const PLAYER_POSITION_API_BASE = 'https://api-7ourym2t2q-uc.a.run.app/playerPosition';
const FIXTURE_STATISTICS_API_BASE = 'https://api-7ourym2t2q-uc.a.run.app/fixtures/statistics';
const TEAM_PERFORMANCE_API_BASE = 'https://api-7ourym2t2q-uc.a.run.app/teamPerformance';
const ANALYSIS_API_BASE = 'https://api-7ourym2t2q-uc.a.run.app/analysis';

/** Build a Match-like object from predict API response for display */
function matchFromPredictResponse(raw: any, fixtureId: number): Match | null {
  const item = raw?.data?.[0];
  if (!item?.teams?.home || !item?.teams?.away) return null;
  const home = item.teams.home;
  const away = item.teams.away;
  const pred = item.predictions || {};
  const percent = pred.percent || {};
  const parsePct = (s: string) => (typeof s === 'string' ? parseFloat(s.replace('%', '')) : 0) || 0;
  const confidence = Math.max(parsePct(percent.home), parsePct(percent.draw), parsePct(percent.away));
  const advice = pred.advice || '';

  return {
    id: String(fixtureId),
    sport: 'Football',
    homeTeam: home.name ?? '',
    awayTeam: away.name ?? '',
    homeLogo: home.logo ?? '',
    awayLogo: away.logo ?? '',
    time: '',
    aiConfidence: confidence,
    aiPrediction: advice,
    keyInsight: advice,
    detailedAnalysis: [advice, pred.winner?.comment].filter(Boolean).join('. '),
    liveConfidence: confidence,
    livePrediction: advice,
    recentForm: typeof home.league?.form === 'string' || typeof away.league?.form === 'string'
      ? { home: (home.league?.form ?? '').split(''), away: (away.league?.form ?? '').split('') }
      : undefined,
    headToHead: Array.isArray(item.h2h) ? item.h2h.slice(0, 10).map((h: any) => ({
      date: h.fixture?.date ? new Date(h.fixture.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '',
      result: h.teams?.home?.winner ? (h.teams.home.name ?? '') : h.teams?.away?.winner ? (h.teams.away.name ?? '') : 'Draw',
      score: h.score?.fulltime ? `${h.score.fulltime.home ?? ''}-${h.score.fulltime.away ?? ''}` : '',
    })) : undefined,
    tacticalMatrix: item.comparison && typeof item.comparison === 'object'
      ? Object.entries(item.comparison)
          .filter(([, v]: [string, any]) => v && typeof v === 'object' && 'home' in v && 'away' in v)
          .map(([k, v]: [string, any]) => ({
            label: { form: 'Form', att: 'Attack', def: 'Defence', goals: 'Goals', total: 'Total', poisson_distribution: 'Poisson', h2h: 'H2H' }[k] ?? k,
            home: parseFloat(String((v as any).home || '0').replace('%', '')) || 0,
            away: parseFloat(String((v as any).away || '0').replace('%', '')) || 0,
          }))
      : undefined,
    teamStats: home.league?.goals?.for?.total && away.league?.goals?.for?.total
      ? [{ label: 'Goals', home: (home.league.goals.for.total as any).total ?? 0, away: (away.league.goals.for.total as any).total ?? 0 }]
      : undefined,
    xFactor: pred.winner?.name ? { title: pred.winner.name, description: (pred.winner.comment || advice) as string } : undefined,
    odds: { home: 0 },
  } as Match;
}

interface AnalysisViewProps {
  match: Match | null;
  fixtureId?: number;
  homeTeamId?: number;
  awayTeamId?: number;
  onSavePrediction: (prediction: SavedPrediction) => void;
  onBack: () => void;
  t: (key: string) => string;
  language: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Build metrics payload for logging/API from AnalysisView data */
function buildMetricsPayload(
  match: Match | null,
  h2hData: Array<{ date: string; result: string; score: string; homeName?: string; awayName?: string; homeGoals?: number; awayGoals?: number }>,
  ballPossession: { home: number; away: number } | null,
  goalsAverage: { home: string; away: string } | null,
  goalsAgainstAverage: { home: string; away: string } | null,
  cornerKicks: { home: number; away: number } | null,
  injuriesData: Array<{ teamName: string; playerName: string; type: string; reason: string; playerId?: number; position?: string }>
): Record<string, unknown> {
  if (!match) return {};

  const recentForm = match.recentForm
    ? {
        home: (match.recentForm.home || []).slice(0, 5),
        away: (match.recentForm.away || []).slice(0, 5),
      }
    : undefined;

  const h2h = h2hData
    .map((h) => {
      if (h.homeName != null && h.awayName != null && h.homeGoals != null && h.awayGoals != null) {
        return `${h.homeName} ${h.homeGoals}-${h.awayGoals} ${h.awayName}`;
      }
      return `${match.homeTeam} ${h.score} ${match.awayTeam}`;
    })
    .filter(Boolean);

  const possession =
    ballPossession != null
      ? { home: ballPossession.home, away: ballPossession.away }
      : undefined;

  const homeGoalsNum = goalsAverage?.home ? parseFloat(goalsAverage.home) : 0;
  const awayGoalsNum = goalsAverage?.away ? parseFloat(goalsAverage.away) : 0;
  const goalsPerGame =
    goalsAverage != null && (goalsAverage.home !== '' || goalsAverage.away !== '')
      ? { home: isNaN(homeGoalsNum) ? 0 : homeGoalsNum, away: isNaN(awayGoalsNum) ? 0 : awayGoalsNum }
      : undefined;

  const corners =
    cornerKicks != null
      ? { home: cornerKicks.home, away: cornerKicks.away }
      : undefined;

  const injuriesByTeam: Record<string, Array<{ position?: string; reason: string }>> = {};
  injuriesData.forEach((i) => {
    const key = i.teamName || 'Unknown';
    if (!injuriesByTeam[key]) injuriesByTeam[key] = [];
    injuriesByTeam[key].push({
      position: i.position || i.type || undefined,
      reason: i.reason || i.type || 'out',
    });
  });
  const injuries = Object.entries(injuriesByTeam).map(([team, list]) => {
    if (list.length === 0) return '';
    const byPosition: Record<string, number> = {};
    const byPositionReason: Record<string, string> = {};
    list.forEach(({ position, reason }) => {
      const p = position || 'player';
      byPosition[p] = (byPosition[p] ?? 0) + 1;
      if (reason && reason !== 'out') byPositionReason[p] = reason;
    });
    const parts = Object.entries(byPosition).map(([pos, count]) => {
      const reason = byPositionReason[pos];
      const label = pos.toLowerCase();
      const plural = count > 1 ? (label.endsWith('s') ? label : label + 's') : label;
      if (count > 1) return `${count} ${plural} out`;
      return reason ? `${plural} ${reason}` : `${plural} out`;
    });
    return `${team}: ${parts.join(', ')}`;
  }).filter(Boolean);

  const payload: Record<string, unknown> = {
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
  };
  if (recentForm) payload.recentForm = recentForm;
  if (h2h.length > 0) payload.h2h = h2h;
  if (possession) payload.possession = possession;
  if (goalsPerGame) payload.goalsPerGame = goalsPerGame;
  const homeAgainstNum = goalsAgainstAverage?.home != null && goalsAgainstAverage.home !== ''
    ? parseFloat(goalsAgainstAverage.home)
    : NaN;
  const awayAgainstNum = goalsAgainstAverage?.away != null && goalsAgainstAverage.away !== ''
    ? parseFloat(goalsAgainstAverage.away)
    : NaN;
  payload.goalsConceded =
    goalsAgainstAverage != null && (goalsAgainstAverage.home !== '' || goalsAgainstAverage.away !== '')
      ? {
          home: Number.isNaN(homeAgainstNum) ? 0 : parseFloat(goalsAgainstAverage.home),
          away: Number.isNaN(awayAgainstNum) ? 0 : parseFloat(goalsAgainstAverage.away),
        }
      : { home: 0, away: 0 };
  if (corners) payload.corners = corners;
  if (injuries.length > 0) payload.injuries = injuries;

  return payload;
}

const AnalysisView: React.FC<AnalysisViewProps> = ({ match: matchProp, fixtureId, homeTeamId: homeTeamIdProp, awayTeamId: awayTeamIdProp, onSavePrediction, onBack, t, language }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'stats'>('overview');
  const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(false);
  const [fetchedMatch, setFetchedMatch] = useState<Match | null>(null);
  const [isLoadingFixture, setIsLoadingFixture] = useState(false);
  const [homeTeamId, setHomeTeamId] = useState<number | null>(null);
  const [awayTeamId, setAwayTeamId] = useState<number | null>(null);
  const [h2hData, setH2hData] = useState<Array<{ date: string; result: string; score: string; homeName?: string; awayName?: string; homeGoals?: number; awayGoals?: number }>>([]);
  const [h2hLoading, setH2hLoading] = useState(false);
  const [ballPossession, setBallPossession] = useState<{ home: number; away: number } | null>(null);
  const [ballPossessionLoading, setBallPossessionLoading] = useState(false);
  const [cornerKicks, setCornerKicks] = useState<{ home: number; away: number } | null>(null);
  const [injuriesData, setInjuriesData] = useState<Array<{ teamName: string; playerName: string; playerPhoto: string; type: string; reason: string; playerId?: number; position?: string }>>([]);
  const [injuriesLoading, setInjuriesLoading] = useState(false);
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [goalsAverage, setGoalsAverage] = useState<{ home: string; away: string } | null>(null);
  const [goalsAverageLoading, setGoalsAverageLoading] = useState(false);
  const [goalsAgainstAverage, setGoalsAgainstAverage] = useState<{ home: string; away: string } | null>(null);
  const [analysisResponse, setAnalysisResponse] = useState<unknown>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const expandAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!fixtureId) return;
    let cancelled = false;
    setIsLoadingFixture(true);
    setHomeTeamId(null);
    setAwayTeamId(null);
    setLeagueId(null);
    setH2hData([]);
    setInjuriesData([]);
    setGoalsAverage(null);
    setGoalsAgainstAverage(null);
    setAnalysisResponse(null);
    setAnalysisError(null);
    fetch(`${PREDICT_API_BASE}/${fixtureId}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        const item = json?.data?.[0];
        if (item?.teams?.home?.id != null) setHomeTeamId(Number(item.teams.home.id));
        if (item?.teams?.away?.id != null) setAwayTeamId(Number(item.teams.away.id));
        if (item?.league?.id != null) setLeagueId(Number(item.league.id));
        setFetchedMatch(matchFromPredictResponse(json, fixtureId));
      })
      .catch(() => { if (!cancelled) setFetchedMatch(null); })
      .finally(() => { if (!cancelled) setIsLoadingFixture(false); });
    return () => { cancelled = true; };
  }, [fixtureId]);

  const effectiveHomeTeamId = homeTeamId ?? homeTeamIdProp ?? null;
  const effectiveAwayTeamId = awayTeamId ?? awayTeamIdProp ?? null;

  useEffect(() => {
    if (effectiveHomeTeamId == null || effectiveAwayTeamId == null) return;
    let cancelled = false;
    setH2hLoading(true);
    setBallPossession(null);
    setBallPossessionLoading(false);
    fetch(`${H2H_API_BASE}/${effectiveHomeTeamId}/${effectiveAwayTeamId}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        const list = Array.isArray(json?.data) ? json.data : [];
        const parsed = list.map((h: any) => {
          const date = h.fixture?.date
            ? new Date(h.fixture.date).toISOString().slice(0, 10)
            : '';
          const homeWinner = h.teams?.home?.winner;
          const awayWinner = h.teams?.away?.winner;
          const ft = h.score?.fulltime;
          const homeGoals = ft?.home ?? h.goals?.home ?? 0;
          const awayGoals = ft?.away ?? h.goals?.away ?? 0;
          const winnerTeamName =
            homeWinner === true ? (h.teams?.home?.name ?? '') :
            awayWinner === true ? (h.teams?.away?.name ?? '') :
            homeGoals > awayGoals ? (h.teams?.home?.name ?? '') :
            awayGoals > homeGoals ? (h.teams?.away?.name ?? '') :
            'Draw';
          const score = ft != null ? `${ft.home ?? ''}-${ft.away ?? ''}` : '';
          const homeName = h.teams?.home?.name ?? '';
          const awayName = h.teams?.away?.name ?? '';
          return { date, result: winnerTeamName, score, homeName, awayName, homeGoals, awayGoals };
        });
        setH2hData(parsed);
        const firstMatch = list[0];
        if (firstMatch?.league?.id != null) setLeagueId((prev) => prev ?? Number(firstMatch.league.id));
        const statsFixtureId = firstMatch?.fixture?.id;
        const statsHomeId = firstMatch?.teams?.home?.id;
        const statsAwayId = firstMatch?.teams?.away?.id;
        if (statsFixtureId != null && statsHomeId != null && statsAwayId != null) {
          setBallPossessionLoading(true);
          setBallPossession(null);
          setCornerKicks(null);
          const parsePossession = (res: any) => {
            const stats = res?.data?.[0]?.statistics;
            const ball = Array.isArray(stats) ? stats.find((s: any) => s.type === 'Ball Possession') : null;
            return parseFloat(String(ball?.value ?? '0').replace('%', '')) || 0;
          };
          const parseCornerKicks = (res: any) => {
            const stats = res?.data?.[0]?.statistics;
            const corner = Array.isArray(stats) ? stats.find((s: any) => (s.type || '').toLowerCase().includes('corner')) : null;
            const raw = String(corner?.value ?? '0').replace(/\s/g, '');
            return parseInt(raw, 10) || 0;
          };
          Promise.all([
            fetch(`${FIXTURE_STATISTICS_API_BASE}/${statsFixtureId}/${statsHomeId}`).then((r) => r.json()),
            fetch(`${FIXTURE_STATISTICS_API_BASE}/${statsFixtureId}/${statsAwayId}`).then((r) => r.json()),
          ])
            .then(([homeRes, awayRes]) => {
              if (cancelled) return;
              const homePoss = parsePossession(homeRes);
              const awayPoss = parsePossession(awayRes);
              setBallPossession({ home: homePoss, away: awayPoss });
              const homeCorners = parseCornerKicks(homeRes);
              const awayCorners = parseCornerKicks(awayRes);
              setCornerKicks({ home: homeCorners, away: awayCorners });
            })
            .catch(() => {
              if (!cancelled) {
                setBallPossession(null);
                setCornerKicks(null);
              }
            })
            .finally(() => { if (!cancelled) setBallPossessionLoading(false); });
        }
      })
      .catch(() => { if (!cancelled) setH2hData([]); })
      .finally(() => { if (!cancelled) setH2hLoading(false); });
    return () => { cancelled = true; };
  }, [effectiveHomeTeamId, effectiveAwayTeamId]);

  useEffect(() => {
    if (effectiveHomeTeamId == null || effectiveAwayTeamId == null || leagueId == null) return;
    let cancelled = false;
    const season = "2025";
    setGoalsAverageLoading(true);
    setGoalsAverage(null);
    setGoalsAgainstAverage(null);
    Promise.all([
      fetch(`${TEAM_PERFORMANCE_API_BASE}/${effectiveHomeTeamId}/${leagueId}/${season}`).then((r) => r.json()),
      fetch(`${TEAM_PERFORMANCE_API_BASE}/${effectiveAwayTeamId}/${leagueId}/${season}`).then((r) => r.json()),
    ])
      .then(([homeRes, awayRes]) => {
        if (cancelled) return;
        const h = homeRes?.data;
        const a = awayRes?.data;
        const homeAvg = h?.goals?.for?.average?.home ?? '';
        const awayAvg = a?.goals?.for?.average?.away ?? '';
        setGoalsAverage({ home: String(homeAvg), away: String(awayAvg) });
        const homeAgainst = h?.goals?.against?.average?.home ?? '';
        const awayAgainst = a?.goals?.against?.average?.away ?? '';
        setGoalsAgainstAverage({ home: String(homeAgainst), away: String(awayAgainst) });
      })
      .catch(() => {
        if (!cancelled) {
          setGoalsAverage(null);
          setGoalsAgainstAverage(null);
        }
      })
      .finally(() => { if (!cancelled) setGoalsAverageLoading(false); });
    return () => { cancelled = true; };
  }, [effectiveHomeTeamId, effectiveAwayTeamId, leagueId]);

  useEffect(() => {
    if (fixtureId == null) return;
    let cancelled = false;
    setInjuriesLoading(true);
    fetch(`${INJURIES_API_BASE}/${fixtureId}`)
      .then((res) => res.json())
      .then(async (json) => {
        if (cancelled) return;
        const list = Array.isArray(json?.data) ? json.data : [];
        const seen = new Set<number>();
        const parsed = list
          .filter((item: any) => {
            const id = item?.player?.id;
            if (id == null || seen.has(id)) return false;
            seen.add(id);
            return true;
          })
          .map((item: any) => ({
            teamName: item?.team?.name ?? '',
            playerName: item?.player?.name ?? '',
            playerPhoto: item?.player?.photo ?? '',
            type: item?.player?.type ?? '',
            reason: item?.player?.reason ?? '',
            playerId: item?.player?.id,
          }));
        type InjuryItem = { teamName: string; playerName: string; playerPhoto: string; type: string; reason: string; playerId?: number };
        const withPositions = await Promise.all(
          parsed.map(async (p: InjuryItem) => {
            if (cancelled || p.playerId == null) return { ...p, position: undefined as string | undefined };
            try {
              const posRes = await fetch(`${PLAYER_POSITION_API_BASE}/${p.playerId}`);
              const posJson = await posRes.json();
              const position = posJson?.data?.[0]?.players?.[0]?.position;
              return { ...p, position: typeof position === 'string' ? position : undefined };
            } catch {
              return { ...p, position: undefined };
            }
          })
        );
        if (!cancelled) setInjuriesData(withPositions);
      })
      .catch(() => { if (!cancelled) setInjuriesData([]); })
      .finally(() => { if (!cancelled) setInjuriesLoading(false); });
    return () => { cancelled = true; };
  }, [fixtureId]);

  const match = matchProp ?? fetchedMatch;
  const data = match as any;

  useEffect(() => {
    if (!match || fixtureId == null) return;
    const payload = buildMetricsPayload(
      match,
      h2hData,
      ballPossession,
      goalsAverage,
      goalsAgainstAverage,
      cornerKicks,
      injuriesData
    );
  }, [match, fixtureId, h2hData, ballPossession, goalsAverage, goalsAgainstAverage, cornerKicks, injuriesData]);

  useEffect(() => {
    if (!match || fixtureId == null) return;
    let cancelled = false;

    const run = async () => {
      try {
        setAnalysisLoading(true);
        setAnalysisError(null);

        const cacheKey = `elitebet_analysis_${fixtureId}`;

        // Try load from cache first; if present, use it and skip API
        try {
          const cachedRaw = await AsyncStorage.getItem(cacheKey);
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw) as { timestamp: number; data: unknown };
            if (!cancelled) {
              setAnalysisResponse(cached.data);
              setAnalysisLoading(false);
            }
            return;
          }
        } catch {
          // ignore cache read errors and fall through to network
        }

        // Build fresh payload and call analysis API
        const payload = buildMetricsPayload(
          match,
          h2hData,
          ballPossession,
          goalsAverage,
          goalsAgainstAverage,
          cornerKicks,
          injuriesData
        );

        const res = await fetch(ANALYSIS_API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new Error(`Analysis API ${res.status}`);
        }
        const json = await res.json();

        if (!cancelled) {
          setAnalysisResponse(json);
        }

        // Save to cache with timestamp (for potential future TTL logic)
        try {
          const toStore = JSON.stringify({ timestamp: Date.now(), data: json });
          await AsyncStorage.setItem(cacheKey, toStore);
        } catch {
          // ignore cache write errors
        }
      } catch (err: any) {
        if (!cancelled) {
          setAnalysisError(err?.message ?? 'Analysis failed');
        }
      } finally {
        if (!cancelled) {
          setAnalysisLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [match, fixtureId, h2hData, ballPossession, goalsAverage, goalsAgainstAverage, cornerKicks, injuriesData]);

  const unifiedPrediction = data?.livePrediction && (data.livePrediction as string).includes('/')
    ? data.livePrediction
    : (match?.aiPrediction?.includes('/') ? match.aiPrediction : (match ? t(match.aiPrediction) : ''));

  const handleTrackPrediction = () => {
    if (!match) return;
    triggerHaptic('success');
    const odds = (match as any).odds?.home ?? 0;
    onSavePrediction({
      id: Math.random().toString(36).substr(2, 9),
      matchTitle: `${match.homeTeam} vs ${match.awayTeam}`,
      selection: unifiedPrediction,
      odds,
      status: 'pending',
      timestamp: new Date(),
      homeLogo: match.homeLogo,
      awayLogo: match.awayLogo,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam
    });
  };

  const handleAnalysisToggle = () => {
    triggerHaptic('light');
    const toValue = isAnalysisExpanded ? 0 : 1;
    setIsAnalysisExpanded(!isAnalysisExpanded);
    
    Animated.spring(expandAnim, {
      toValue,
      useNativeDriver: false,
      tension: 50,
      friction: 7,
    }).start();
  };

  const renderFormDots = (results: string[] = []) => (
    <View className="flex-row gap-1.5">
      {results.map((res, i) => (
        <View 
          key={i} 
          className={`w-5 h-5 rounded-full flex items-center justify-center border ${
            res === 'W' ? 'bg-green-500/20 border-green-500/40' :
            res === 'L' ? 'bg-red-500/20 border-red-500/40' :
            'bg-gray-500/20 border-gray-500/40'
          }`}
        >
          <Text className={`text-[9px] font-black ${
            res === 'W' ? 'text-green-400' :
            res === 'L' ? 'text-red-400' :
            'text-gray-400'
          }`}>
            {res}
          </Text>
        </View>
      ))}
    </View>
  );

  const BackIcon = () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </Svg>
  );

  const ChevronDownIcon = ({ rotated }: { rotated?: boolean }) => (
    <Svg 
      width={16} 
      height={16} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="rgba(255, 255, 255, 0.3)" 
      strokeWidth={2}
      style={{ transform: [{ rotate: rotated ? '180deg' : '0deg' }] }}
    >
      <Path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </Svg>
  );

  const SparkleIcon = () => (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </Svg>
  );

  const BrainIcon = () => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.364-6.364l-.707-.707M6.707 17.293l.707-.707M18 12a6 6 0 11-12 0 6 6 0 0112 0z" />
    </Svg>
  );

  const WarningIcon = () => (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </Svg>
  );

  const BookmarkIcon = () => (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </Svg>
  );

  if (fixtureId && (isLoadingFixture || !match)) {
    return (
      <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
        <View className="px-4 pt-2 pb-4 flex-row items-center bg-black/40 border-b border-white/5">
          <Pressable onPress={() => { triggerHaptic('light'); onBack(); }} className="w-8 h-8 rounded-full glass-dark flex items-center justify-center border border-white/10">
            <BackIcon />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center py-20">
          <ActivityIndicator size="large" color="#007AFF" />
          <Text className="text-[13px] text-white/60 mt-3">{t('loading') || 'Loading...'}</Text>
        </View>
      </View>
    );
  }

  if (!match) return null;

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-4 pt-2 pb-4 flex-row justify-between items-center bg-black/40 border-b border-white/5">
        <Pressable 
          onPress={() => {
            triggerHaptic('light');
            onBack();
          }} 
          className="w-8 h-8 rounded-full glass-dark flex items-center justify-center border border-white/10"
        >
          <BackIcon />
        </Pressable>
        <View className="flex flex-col items-center">
          <Text className="text-[10px] font-bold tracking-[0.07em] uppercase text-[#5AC8FA] mb-0.5">
            LIVE INTELLIGENCE
          </Text>
          <Text className="text-white font-bold text-[16px] tracking-tight" numberOfLines={1} style={{ maxWidth: 200 }}>
            {match.homeTeam} vs {match.awayTeam.length > 15 ? match.awayTeam.substring(0, 15) + '...' : match.awayTeam}
          </Text>
        </View>
        <View className="w-8 h-8 glass-dark rounded-full flex items-center justify-center border border-white/10 relative">
          <View className="w-1.5 h-1.5 bg-green-500 rounded-full" />
        </View>
      </View>

      {/* Tabs */}
      <View className="px-4 py-3 bg-black/20 border-b border-white/5">
        <View className="flex-row bg-[#1a1a1a] rounded-full p-1">
          <Pressable 
            onPress={() => { 
              setActiveTab('overview'); 
              triggerHaptic('selection'); 
            }} 
            className={`flex-1 py-2.5 rounded-full ${activeTab === 'overview' ? 'bg-[#007AFF]' : 'bg-transparent'}`}
            style={activeTab === 'overview' ? { shadowColor: '#007AFF', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } } : {}}
          >
            <Text className={`text-[13px] font-semibold text-center ${activeTab === 'overview' ? 'text-white' : 'text-[#8e8e93]'}`}>
              {t('overview')}
            </Text>
          </Pressable>
          <Pressable 
            onPress={() => { 
              setActiveTab('stats'); 
              triggerHaptic('selection'); 
            }} 
            className={`flex-1 py-2.5 rounded-full ${activeTab === 'stats' ? 'bg-[#007AFF]' : 'bg-transparent'}`}
            style={activeTab === 'stats' ? { shadowColor: '#007AFF', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } } : {}}
          >
            <Text className={`text-[13px] font-semibold text-center ${activeTab === 'stats' ? 'text-white' : 'text-[#8e8e93]'}`}>
              {t('metrics')}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Content */}
      <ScrollView 
        className="flex-1 pt-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 180, paddingHorizontal: 16 }}
      >
        {activeTab === 'overview' ? (
          <View className="gap-5">
            {/* Teams */}
            <View className="flex-row justify-center items-center gap-6 py-2">
              <View className="flex flex-col items-center gap-2" style={{ width: 112 }}>
              <TeamLogo src={match.homeLogo} alt='home logo' size='md'/>
                <Text className="text-[13px] font-bold text-white/80 text-center" numberOfLines={2} style={{ minHeight: 38 }}>
                  {match.homeTeam}
                </Text>
              </View>
              <Text className="text-[16px] font-black text-[#007AFF] tracking-[0.4em]">VS</Text>
              <View className="flex flex-col items-center gap-2" style={{ width: 112 }}>
                
                <TeamLogo src={match.awayLogo} alt={match.awayTeam} size="md" />
                <Text className="text-[13px] font-bold text-white/80 text-center" numberOfLines={2} style={{ minHeight: 38 }}>
                  {match.awayTeam}
                </Text>
              </View>
            </View>

            {/* Signal Strength */}
            {/* <View className="glass rounded-[28px] p-5 border border-white/10 relative overflow-hidden">
              <View className="flex-row justify-between items-end mb-3 relative z-10">
                <View>
                  <Text className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.07em] mb-0.5">
                    {t('signalStrength')}
                  </Text>
                  <Text className="text-[13px] text-white/60 font-medium">{t('neuralPath')}</Text>
                </View>
                <Text className="text-[28px] font-bold text-white">
                  {data?.liveConfidence || match.aiConfidence || 0}%
                </Text>
              </View>
              <View className="h-3 w-full bg-white/5 rounded-full overflow-hidden relative z-10">
                <View 
                  className="h-full bg-blue-600"
                  style={{ 
                    width: `${data?.liveConfidence || match.aiConfidence || 0}%`,
                    backgroundColor: '#007AFF'
                  }}
                />
              </View>
            </View> */}

            {/* Master Edge - from analysis API or match keyInsight */}



            {(analysisLoading || ((analysisResponse as any)?.data?.analysis?.['Master Edge'] ?? data?.keyInsight)) && (
              <View className="bg-blue-600/10 border border-blue-500/20 rounded-[24px] p-5 relative overflow-hidden">
                <View className="flex-row items-center gap-2.5 mb-2">
                  <View className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center">
                    <SparkleIcon />
                  </View>
                  <Text className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
                    {t('masterEdge')}
                  </Text>
                </View>
                {analysisLoading ? (
                  <View className="py-3 flex-row items-center gap-2">
                    <ActivityIndicator size="small" color="#007AFF" />
                    <Text className="text-[13px] text-white/50">Loading...</Text>
                  </View>
                ) : (
                  <Text className="text-[14px] font-bold text-white leading-tight">
                    "{(analysisResponse as any)?.data?.analysis?.['Master Edge'] ?? data?.keyInsight}"
                  </Text>
                )}
              </View>
            )}

            {/* Neural Synthesis - from analysis API or match detailedAnalysis */}
            <Pressable 
              onPress={handleAnalysisToggle}
              className={`glass-dark rounded-[28px] p-6 border border-blue-500/20 ${isAnalysisExpanded ? 'pb-8' : ''}`}
            >
              <View className="flex-row items-center gap-3 mb-4 relative z-10">
              <View className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center">
                  <BrainIcon/>
                  </View>
                {/* <View className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                  <BrainIcon />
                </View> */}
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="font-semibold text-[14px] text-white">{t('neuralSynthesis')}</Text>
                  </View>
                  <Text className="text-[10px] text-blue-500/60 font-bold uppercase tracking-widest">
                    {t('tacticalEngine')}
                  </Text>
                </View>
                <View>
                  <ChevronDownIcon rotated={isAnalysisExpanded} />
                </View>
              </View>
              <View className="relative z-10">
                {analysisLoading ? (
                  <View className="py-4 flex-row items-center gap-2">
                    <ActivityIndicator size="small" color="#007AFF" />
                    <Text className="text-[13px] text-white/50">Loading...</Text>
                  </View>
                ) : (
                  <>
                    <Text 
                      className="text-[13px] leading-[18px] text-white/80 font-normal"
                      numberOfLines={isAnalysisExpanded ? undefined : 3}
                    >
                      {(analysisResponse as any)?.data?.analysis?.['Neural Synthesis'] ?? data?.detailedAnalysis}
                    </Text>
                    {!isAnalysisExpanded && (
                      <View className="mt-3 flex justify-center relative z-10">
                        <Text className="text-[11px] font-bold text-blue-500 uppercase tracking-[0.07em]">
                          {t('viewIntel')}
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            </Pressable>

            {/* The X-Factor - from analysis API or match xFactor */}
            {(analysisLoading || ((analysisResponse as any)?.data?.analysis?.['The X-Factor'] ?? data?.xFactor)) && (
              <View className="glass-dark rounded-[24px] p-5 border border-orange-500/10 bg-orange-500/[0.01]">
                <Text className="text-[10px] font-bold text-orange-400 uppercase tracking-[0.07em] mb-2">
                  {t('xFactor')}
                </Text>
                {analysisLoading ? (
                  <View className="py-3 flex-row items-center gap-2">
                    <ActivityIndicator size="small" color="#007AFF" />
                    <Text className="text-[13px] text-white/50">Loading...</Text>
                  </View>
                ) : (
                  <View className="gap-1.5">
                    <Text className="text-[16px] font-bold text-white leading-tight">
                      {data?.xFactor?.title ?? 'The X-Factor'}
                    </Text>
                    <Text className="text-[13px] text-white/50 leading-normal font-normal">
                      {(analysisResponse as any)?.data?.analysis?.['The X-Factor'] ?? data?.xFactor?.description}
                    </Text>
                  </View>
                )}
              </View>
            )}

          </View>
        ) : (
          <View className="gap-6 pb-10">
          

            {/* Recent Form */}
            {data?.recentForm && (
              <View>
                <Text className="text-[10px] font-bold uppercase tracking-[0.07em] text-white/40 mb-3">
                  RECENT FORM ANALYSIS
                </Text>
                <View className="bg-[#1a1a1a] rounded-[24px] p-5 gap-4 border border-white/10">
                  <View className="flex-row justify-between items-center">
                    <Text className="text-[13px] font-bold text-white">{match.homeTeam}</Text>
                    {renderFormDots((data.recentForm.home || []).slice(0, 5))}
                  </View>
                  <View className="h-[1px] bg-white/20 w-full" />
                  <View className="flex-row justify-between items-center">
                    <Text className="text-[13px] font-bold text-white">{match.awayTeam}</Text>
                    {renderFormDots((data.recentForm.away || []).slice(0, 5))}
                  </View>
                </View>
              </View>
            )}

          

            {/* Head to Head - from H2H API or match data */}
            {((h2hData.length > 0) || (data?.headToHead && data.headToHead.length > 0) || h2hLoading) && (
              <View className="px-1">
                <Text className="text-[10px] font-bold uppercase tracking-[0.07em] text-white/30 mb-3">
                  Elite H2H History
                </Text>
                {h2hLoading ? (
                  <View className="glass rounded-[24px] p-6 border border-white/5 items-center justify-center min-h-[120px]">
                    <ActivityIndicator size="small" color="#007AFF" />
                    <Text className="text-[12px] text-white/50 mt-2">Loading head-to-head...</Text>
                  </View>
                ) : (
                  <View className="glass rounded-[24px] overflow-hidden border border-white/5">
                    {(h2hData.length > 0 ? h2hData : (data?.headToHead || [])).map((h2h: { date: string; result: string; score: string }, idx: number, arr: Array<{ date: string; result: string; score: string }>) => (
                      <View 
                        key={idx} 
                        className={`p-4 flex-row items-center justify-between ${idx !== arr.length - 1 ? 'border-b border-white/5' : ''}`}
                      >
                        <View className="flex flex-col">
                          <Text className="text-[11px] font-bold text-white/80">{h2h.date}</Text>
                          <Text className="text-[10px] text-white/30 uppercase font-black tracking-widest">
                            {h2h.result}
                          </Text>
                        </View>
                        <Text className="text-[15px] font-black text-blue-500">
                          {h2h.score}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Tactical Matrix */}
            {(ballPossession != null || ballPossessionLoading || cornerKicks != null || (data?.tacticalMatrix && data.tacticalMatrix.length > 0)) && (
              <View>
                <Text className="text-[10px] font-bold uppercase tracking-[0.07em] text-white/40 mb-3">
                  TACTICAL MATRIX
                </Text>
                <View className="bg-[#1a1a1a] rounded-[24px] p-5 border border-white/10 relative overflow-hidden">
                  {/* Ball Possession from fixture statistics API */}
                  {ballPossessionLoading ? (
                    <View className="py-4 items-center">
                      <ActivityIndicator size="small" color="#007AFF" />
                      <Text className="text-[11px] text-white/50 mt-2">Loading possession...</Text>
                    </View>
                  ) : ballPossession != null ? (
                    <View className="relative mb-4">
                      <View className="flex-row justify-between items-center mb-2">
                        <Text className="text-[14px] font-bold text-white">
                          {ballPossession.home}%
                        </Text>
                        <Text className="text-white text-[11px] font-bold uppercase tracking-wider">
                          BALL POSSESSION
                        </Text>
                        <Text className="text-[14px] font-bold text-white">
                          {ballPossession.away}%
                        </Text>
                      </View>
                      <View className="h-2 w-full bg-white/10 rounded-full overflow-hidden flex-row relative">
                        <View 
                          className="h-full bg-[#007AFF]/30" 
                          style={{ width: `${ballPossession.home}%` }} 
                        />
                        <View 
                          className="h-full bg-white/10" 
                          style={{ width: `${ballPossession.away}%` }} 
                        />
                      </View>
                    </View>
                  ) : null}

                  {/* Corner Kicks from fixture statistics API */}
                  {cornerKicks != null && (
                    <View className="relative">
                      <View className="flex-row justify-between items-center mb-2">
                        <Text className="text-[14px] font-bold text-white">
                          {cornerKicks.home}
                        </Text>
                        <Text className="text-white text-[11px] font-bold uppercase tracking-wider">
                          CORNER KICKS
                        </Text>
                        <Text className="text-[14px] font-bold text-white">
                          {cornerKicks.away}
                        </Text>
                      </View>
                      <View className="h-2 w-full bg-white/10 rounded-full overflow-hidden flex-row relative">
                        <View 
                          className="h-full bg-[#34C759]/40" 
                          style={{ width: `${(cornerKicks.home + cornerKicks.away) > 0 ? (cornerKicks.home / (cornerKicks.home + cornerKicks.away)) * 100 : 50}%` }} 
                        />
                        <View 
                          className="h-full bg-white/10" 
                          style={{ width: `${(cornerKicks.home + cornerKicks.away) > 0 ? (cornerKicks.away / (cornerKicks.home + cornerKicks.away)) * 100 : 50}%` }} 
                        />
                      </View>
                    </View>
                  )}

                </View>
              </View>
            )}

            {/* Injury Report - from injuries API or match data */}
            {((injuriesData.length > 0) || (data?.injuryReport && data.injuryReport.length > 0) || injuriesLoading) && (
              <View className="px-1">
                <Text className="text-[10px] font-bold uppercase tracking-[0.07em] text-white/30 mb-3">
                  Injury & Availability Intel
                </Text>
                {injuriesLoading ? (
                  <View className="glass rounded-[24px] p-6 border border-white/5 items-center justify-center min-h-[120px]">
                    <ActivityIndicator size="small" color="#007AFF" />
                    <Text className="text-[12px] text-white/50 mt-2">Loading injuries...</Text>
                  </View>
                ) : injuriesData.length > 0 ? (
                  <View className="gap-2.5 flex flex-col">
                    {injuriesData.map((injury, idx) => (
                      <View
                        key={`${injury.teamName}-${injury.playerName}-${idx}`}
                        className="glass rounded-[20px] p-4 border border-red-500/10 bg-red-500/[0.02] flex-row items-center gap-3"
                      >
                        {(() => {
                          const uri = injury.playerPhoto;
                          const isValidRemoteUri =
                            !!uri && typeof uri === 'string' && /^https?:\/\//i.test(uri);
                          if (!isValidRemoteUri) {
                            return (
                              <View className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 border border-red-500/20">
                                <WarningIcon />
                              </View>
                            );
                          }
                          return (
                            <Image
                              key={uri}
                              source={{ uri }}
                              className="w-12 h-12 rounded-full bg-white/5 border border-white/10 shrink-0"
                              resizeMode="cover"
                            />
                          );
                        })()}
                        {!injury.playerPhoto && (
                          <View className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 border border-red-500/20">
                            <WarningIcon />
                          </View>
                        )}
                        <View className="flex-1 min-w-0 flex-row items-center justify-between gap-3">
                          <View className="flex-1 min-w-0">
                            <Text className="text-[14px] font-bold text-white" numberOfLines={1}>
                              {injury.playerName}
                              {injury.teamName ? (
                                <Text className="text-white/50 font-normal text-[13px]"> ({injury.teamName})</Text>
                              ) : null}
                            </Text>
                            {(injury.position ?? injury.type) ? (
                              <Text className="text-[10px] font-black text-red-400 uppercase tracking-widest mt-0.5">
                                {injury.position ?? injury.type}
                              </Text>
                            ) : null}
                          </View>
                          {injury.reason ? (
                            <Text className="text-[12px] text-white/60 leading-snug text-right shrink-0">
                              {injury.reason}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : data?.injuryReport && data.injuryReport.length > 0 ? (
                  <View className="gap-2.5">
                    {data.injuryReport.map((injury: any, idx: number) => (
                      <View
                        key={idx}
                        className="glass rounded-[20px] p-4 border border-red-500/10 bg-red-500/[0.02] flex-row items-start gap-3"
                      >
                        <View className="w-8 h-8 rounded-lg glass flex items-center justify-center text-red-500 shrink-0 border border-red-500/20">
                          <WarningIcon />
                        </View>
                        <View className="flex-1">
                          <View className="flex-row justify-between items-center mb-0.5">
                            <Text className="text-[14px] font-bold text-white">
                              {injury.player} <Text className="text-white/30 text-[11px]">({injury.team})</Text>
                            </Text>
                            <Text className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                              {injury.status}
                            </Text>
                          </View>
                          <Text className="text-[13px] text-white/50 leading-snug">
                            {injury.impact}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            )}

            {/* Performance - goals average only from team performance API */}
            {(goalsAverage != null || goalsAverageLoading) && (
              <View>
                <Text className="text-[10px] font-bold uppercase tracking-[0.07em] text-white/30 mb-4 px-1">
                  {t('performance')}
                </Text>
                {goalsAverageLoading ? (
                  <View className="glass-dark rounded-[24px] p-6 border border-white/5 items-center justify-center min-h-[100px]">
                    <ActivityIndicator size="small" color="#007AFF" />
                    <Text className="text-[12px] text-white/50 mt-2">Loading goals average...</Text>
                  </View>
                ) : goalsAverage != null && (goalsAverage.home !== '' || goalsAverage.away !== '') ? (
                  <View className="glass-dark rounded-[24px] p-6 border border-white/5 gap-2">
                    <View className="flex-row justify-between items-center px-1">
                      <Text className="text-[13px] font-bold text-white/90">{goalsAverage.home || '–'}</Text>
                      <Text className="text-[11px] font-bold uppercase text-white/20 tracking-[0.1em]">Goals average</Text>
                      <Text className="text-[13px] font-bold text-white/90">{goalsAverage.away || '–'}</Text>
                    </View>
                    <View className="h-1 w-full bg-white/5 rounded-full overflow-hidden flex-row">
                      <View
                        className="h-full bg-blue-600"
                        style={{
                          width: `${(() => {
                            const home = parseFloat(goalsAverage.home);
                            const away = parseFloat(goalsAverage.away);
                            const total = home + away;
                            return total > 0 ? (home / total) * 100 : 50;
                          })()}%`,
                        }}
                      />
                      <View className="h-full bg-white/10 flex-1" />
                    </View>
                  </View>
                ) : null}
              </View>
            )}

            {/* Goals conceded - from team performance API goalsAgainstAverage */}
            {(goalsAgainstAverage != null || goalsAverageLoading) && (
              <View>
                <Text className="text-[10px] font-bold uppercase tracking-[0.07em] text-white/30 mb-4 px-1">
                  Goals conceded
                </Text>
                {goalsAverageLoading ? (
                  <View className="glass-dark rounded-[24px] p-6 border border-white/5 items-center justify-center min-h-[80px]">
                    <ActivityIndicator size="small" color="#007AFF" />
                  </View>
                ) : goalsAgainstAverage != null && (goalsAgainstAverage.home !== '' || goalsAgainstAverage.away !== '') ? (
                  <View className="glass-dark rounded-[24px] p-6 border border-white/5 gap-2">
                    <View className="flex-row justify-between items-center px-1">
                      <Text className="text-[13px] font-bold text-white/90">{goalsAgainstAverage.home || '–'}</Text>
                      <Text className="text-[11px] font-bold uppercase text-white/20 tracking-[0.1em]">Goals conceded</Text>
                      <Text className="text-[13px] font-bold text-white/90">{goalsAgainstAverage.away || '–'}</Text>
                    </View>
                    <View className="h-1 w-full bg-white/5 rounded-full overflow-hidden flex-row">
                      <View
                        className="h-full bg-amber-500/80"
                        style={{
                          width: `${(() => {
                            const home = parseFloat(goalsAgainstAverage.home);
                            const away = parseFloat(goalsAgainstAverage.away);
                            const total = home + away;
                            return total > 0 ? (home / total) * 100 : 50;
                          })()}%`,
                        }}
                      />
                      <View className="h-full bg-white/10 flex-1" />
                    </View>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Bottom Action Bar */}
      <View 
        className="px-4 py-4 bg-[#1a1a1a] border-t border-white/10 flex flex-col gap-3 absolute bottom-0 left-0 right-0"
        style={{ 
          paddingBottom: insets.bottom + 16,
          zIndex: 1000,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 10
        }}
      >
        <View className="flex-row justify-between items-center">
          <View className="flex flex-col">
            <Text className="text-[10px] text-white/40 font-bold uppercase tracking-[0.07em] mb-1">
              {t('prediction')}
            </Text>
            <Text className="text-[18px] font-bold text-white">{unifiedPrediction}</Text>
          </View>
         
        </View>
        <Pressable 
          onPress={handleTrackPrediction}
          className="w-full h-[52px] rounded-full bg-[#007AFF] flex-row items-center justify-center gap-2.5"
          style={{ shadowColor: '#007AFF', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
        >
          <BookmarkIcon />
          <Text className="text-white font-bold text-[15px]">{t('lockPrediction')}</Text>
        </Pressable>
      </View>
    </View>
  );
};

export default AnalysisView;
