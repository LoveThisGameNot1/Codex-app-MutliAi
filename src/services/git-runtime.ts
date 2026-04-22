import { getGitReview } from '@/services/electron-api';
import { useAppStore } from '@/store/app-store';
import type { GitReviewSnapshot } from '../../shared/contracts';

class GitRuntime {
  public async refreshReview(): Promise<GitReviewSnapshot | null> {
    try {
      const review = await getGitReview();
      useAppStore.getState().setGitReview(review);
      return review;
    } catch {
      useAppStore.getState().setGitReview(null);
      return null;
    }
  }
}

export const gitRuntime = new GitRuntime();
