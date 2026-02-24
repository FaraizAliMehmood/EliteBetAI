export interface FootballMatchFixture {
  id: number;
  date: string;
  referee?: string;
  timezone?: string;
  timestamp?: number;
  venue?: {
    id: number | null;
    name: string;
    city: string;
  };
  status?: {
    long: string;
    short: string;
    elapsed: number | null;
    extra: number | null;
  };
}

export interface FootballMatchLeague {
  id: number;
  name: string;
  country: string;
  logo: string;
  flag: string;
  season: number;
  round: string;
  standings: boolean;
}

export interface FootballMatchTeam {
  id: number;
  name: string;
  logo: string;
  winner: boolean | null;
}

export interface FootballMatchTeams {
  home: FootballMatchTeam;
  away: FootballMatchTeam;
}

export interface FootballMatch {
  fixture: FootballMatchFixture;
  league: FootballMatchLeague;
  teams: FootballMatchTeams;
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  SAVED = 'SAVED',
  SETTINGS = 'SETTINGS',
  SCAN = 'SCAN',
  ANALYSIS = 'ANALYSIS',
}

export interface Match {
  id: string;
  sport: 'Football' | 'Basketball' | 'Tennis' | 'MMA';
  homeTeam: string;
  awayTeam: string;
  homeLogo: string;
  awayLogo: string;
  time: string;
  aiConfidence: number;
  aiPrediction: string;
  keyInsight?: string;
  detailedAnalysis?: string;
  liveConfidence?: number;
  livePrediction?: string;
  xFactor?: {
    title: string;
    description: string;
  };
  momentum?: {
    homeScore: number;
    awayScore: number;
  };
  recentForm?: {
    home: string[];
    away: string[];
  };
  headToHead?: Array<{
    date: string;
    result: string;
    score: string;
  }>;
  tacticalMatrix?: Array<{
    label: string;
    home: number;
    away: number;
  }>;
  teamStats?: Array<{
    label: string;
    home: number;
    away: number;
    unit?: string;
  }>;
  injuryReport?: Array<{
    team: string;
    player: string;
    status: string;
    impact: string;
  }>;
  marketShift?: {
    trend: string;
    movement: string;
  };
  venueImpact?: {
    condition: string;
    impactLevel: string;
    description: string;
  };
}

export interface SavedPrediction {
  id: string;
  status: 'pending' | 'correct' | 'incorrect';
  homeLogo?: string;
  awayLogo?: string;
  homeTeam?: string;
  awayTeam?: string;
  matchTitle: string;
  selection: string;
  timestamp: Date;
  odds: number;
}
