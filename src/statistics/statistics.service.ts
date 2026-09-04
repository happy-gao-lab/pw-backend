import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import DB from '../db/index.js';
import { userStatsTable, wordProgressTable } from '../db/schemas/statistics.schema.js';
import { usersTable } from '../db/schemas/users.schema.js';
import { RecordAttemptDto } from './dto.js';

@Injectable()
export class StatisticsService {
  private async findOrCreateWordProgress(userId: number, wordId: number) {
    const [existing] = await DB.select()
      .from(wordProgressTable)
      .where(
        and(eq(wordProgressTable.userId, userId), eq(wordProgressTable.wordId, wordId)),
      );
    if (existing) {
      return existing;
    }

    const [created] = await DB.insert(wordProgressTable)
      .values({ userId, wordId })
      .returning();
    return created;
  }

  private async findOrCreateUserStats(userId: number) {
    const [existing] = await DB.select()
      .from(userStatsTable)
      .where(eq(userStatsTable.userId, userId));
    if (existing) {
      return existing;
    }

    const [created] = await DB.insert(userStatsTable).values({ userId }).returning();
    return created;
  }

  private toDateOnly(value: string | Date): string {
    return new Date(value).toISOString().slice(0, 10);
  }

  private daysBetween(from: string, to: string): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay);
  }

  private calculatePercentage(correctCount: number, repetitionsTarget: number): number {
    return Math.min(100, Math.round((correctCount / repetitionsTarget) * 100));
  }

  async recordAttempt(userId: number, dto: RecordAttemptDto) {
    const progress = await this.findOrCreateWordProgress(userId, dto.wordId);
    const now = new Date().toISOString();

    const [updatedProgress] = await DB.update(wordProgressTable)
      .set({
        correctCount: dto.isCorrect
          ? progress.correctCount + 1
          : Math.max(0, progress.correctCount - 1),
        incorrectCount: progress.incorrectCount + (dto.isCorrect ? 0 : 1),
        lastPracticedAt: now,
        updatedAt: now,
      })
      .where(eq(wordProgressTable.id, progress.id))
      .returning();

    const stats = await this.findOrCreateUserStats(userId);
    const today = this.toDateOnly(now);

    let currentStreak = stats.currentStreak;

    if (!stats.lastPracticedAt) {
      currentStreak = 1;
    } else {
      const diff = this.daysBetween(this.toDateOnly(stats.lastPracticedAt), today);
      if (diff === 1) {
        currentStreak += 1;
      } else if (diff > 1) {
        currentStreak = 1;
      }
      // diff === 0 (already practiced today) — streak unchanged
    }

    const longestStreak = Math.max(stats.longestStreak, currentStreak);
    const totalScore = stats.totalScore + (dto.isCorrect ? 1 : 0);

    await DB.update(userStatsTable)
      .set({ currentStreak, longestStreak, totalScore, lastPracticedAt: now })
      .where(eq(userStatsTable.userId, userId));

    return {
      wordId: dto.wordId,
      correctCount: updatedProgress.correctCount,
      incorrectCount: updatedProgress.incorrectCount,
      percentage: this.calculatePercentage(
        updatedProgress.correctCount,
        stats.repetitionsTarget,
      ),
    };
  }

  async getLeaderboard() {
    const rows = await DB.select({
      name: usersTable.name,
      totalScore: userStatsTable.totalScore,
    })
      .from(userStatsTable)
      .leftJoin(usersTable, eq(userStatsTable.userId, usersTable.id))
      .orderBy(desc(userStatsTable.totalScore));

    return rows.map((row, index) => ({
      rank: index + 1,
      name: row.name,
      totalScore: row.totalScore,
    }));
  }

  async getStats(userId: number) {
    const stats = await this.findOrCreateUserStats(userId);

    const progressRows = await DB.select()
      .from(wordProgressTable)
      .where(eq(wordProgressTable.userId, userId));

    const words = progressRows
      .map((row) => ({
        wordId: row.wordId,
        correctCount: row.correctCount,
        incorrectCount: row.incorrectCount,
        lastPracticedAt: row.lastPracticedAt,
        percentage: this.calculatePercentage(row.correctCount, stats.repetitionsTarget),
      }))
      .sort((a, b) => a.percentage - b.percentage);

    return {
      repetitionsTarget: stats.repetitionsTarget,
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      lastPracticedAt: stats.lastPracticedAt,
      words,
    };
  }
}
