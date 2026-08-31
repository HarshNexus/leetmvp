export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type Platform = 'LeetCode' | 'GeeksforGeeks' | 'leetcode';
export interface User { id: string; name?: string; email: string }
export interface Problem { _id: string; leetcodeId: number; externalId?: string; title: string; url: string; difficulty: Difficulty }
export interface SolvedProblem { _id: string; platform?: Platform; language?: string; solvedAt: string; problemId: Problem }
export interface Revision {
  _id: string;
  userId?: string;
  problemId?: Problem | null;
  platform?: string;
  stage?: string;
  stageDays?: number;
  scheduledAt?: string;
  nextReviewAt?: string | null;
  solvedAt?: string | null;
  completedAt?: string | null;
  result?: 'Solved' | 'Needed Hint' | 'Not Solved';
  completionMethod?: 'manual' | 'successful_resolve';
  status?: string;
}
export interface AuthResponse { token: string; user: User }
export interface AnalyticsBucket { name: string; count: number; percentage?: number }
export interface AnalyticsPoint { date: string; count: number }
export interface DashboardAnalytics { timezone: string; summary: { total: number; today: number; thisWeek: number; thisMonth: number }; streak: { current: number; longest: number }; activity: AnalyticsPoint[]; difficulty: AnalyticsBucket[]; languages: AnalyticsBucket[]; topics: AnalyticsBucket[]; trends: Record<string, AnalyticsPoint[]>; goals: { daily: number; weekly: number; monthly: number }; achievements: { id: string; name: string; unlocked: boolean }[] }
