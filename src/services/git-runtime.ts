import { getGitReview } from '@/services/electron-api';
import { useAppStore } from '@/store/app-store';

class GitRuntime {
  public async refreshReview(): Promise<void> {
    try {
      const review = await getGitReview();
      useAppStore.getState().setGitReview(review);
    } catch {
      useAppStore.getState().setGitReview(null);
    }
  }
}

export const gitRuntime = new GitRuntime();
