import { AIProvider } from "../providers/AIProvider";
import { GitHubService } from "../services/GitHubService";
import { DiffService } from "../services/DiffService";
import { ReviewResponse } from "../providers/AIProvider";
import * as core from "@actions/core";

export interface ReviewServiceConfig {
  maxComments: number;
  approveReviews: boolean;
  projectContext?: string;
  contextFiles?: string[];
}

export class ReviewService {
  private config: ReviewServiceConfig;

  constructor(
    private aiProvider: AIProvider,
    private githubService: GitHubService,
    private diffService: DiffService,
    config: ReviewServiceConfig,
  ) {
    this.config = {
      maxComments: config.maxComments || 0,
      approveReviews: config.approveReviews,
      projectContext: config.projectContext,
      contextFiles: config.contextFiles || ["package.json", "README.md"],
    };
  }

  async performReview(prNumber: number): Promise<ReviewResponse> {
    core.info(`Starting review for PR #${prNumber}`);

    // Get PR details
    const prDetails = await this.githubService.getPRDetails(prNumber);
    core.info(`PR title: ${prDetails.title}`);

    // Get modified files from diff
    const lastReviewedCommit =
      await this.githubService.getLastReviewedCommit(prNumber);
    const isUpdate = !!lastReviewedCommit;

    // If this is an update, get previous reviews
    let previousReviews;
    if (isUpdate) {
      previousReviews = await this.githubService.getPreviousReviews(prNumber);
      core.debug(`Found ${previousReviews.length} previous reviews`);
    }

    const modifiedFiles = await this.diffService.getRelevantFiles(
      prDetails,
      lastReviewedCommit,
    );
    core.info(`Modified files length: ${modifiedFiles.length}`);

    // Get full content for each modified file
    const filesWithContent = await Promise.all(
      modifiedFiles.map(async (file) => {
        const fullContent = await this.githubService.getFileContent(
          file.path,
          prDetails.head,
        );
        return {
          path: file.path,
          content: fullContent,
          originalContent: await this.githubService.getFileContent(
            file.path,
            prDetails.base,
          ),
          diff: file.diff,
        };
      }),
    );

    // Get repository context (now using configured files)
    const contextFiles = await this.getRepositoryContext();

    // Perform AI review
    const review = await this.aiProvider.review({
      files: filesWithContent,
      contextFiles,
      previousReviews,
      pullRequest: {
        title: prDetails.title,
        description: prDetails.description,
        base: prDetails.base,
        head: prDetails.head,
      },
      context: {
        repository: process.env.GITHUB_REPOSITORY ?? "",
        owner: process.env.GITHUB_REPOSITORY_OWNER ?? "",
        projectContext: this.config.projectContext,
        isUpdate,
      },
    });

    // Add model name to summary
    const modelInfo = `_Code review performed by \`${process.env.INPUT_AI_PROVIDER?.toUpperCase() || "AI"} - ${process.env.INPUT_AI_MODEL}\`._`;
    review.summary = `${review.summary}\n\n------\n\n${modelInfo}`;

    // Submit review
    await this.githubService.submitReview(prNumber, {
      ...review,
      lineComments:
        this.config.maxComments > 0
          ? review.lineComments?.slice(0, this.config.maxComments)
          : review.lineComments,
      suggestedAction: this.normalizeReviewEvent(review.suggestedAction),
    });

    return review;
  }

  private async getRepositoryContext(): Promise<
    Array<{ path: string; content: string }>
  > {
    const results = [];

    for (const file of this.config.contextFiles || []) {
      try {
        const content = await this.githubService.getFileContent(file);
        if (content) {
          results.push({ path: file, content });
        }
      } catch (error) {
        // File might not exist, skip it
      }
    }

    return results;
  }

  private normalizeReviewEvent(
    action: string,
  ): "APPROVE" | "REQUEST_CHANGES" | "COMMENT" {
    if (!action || !this.config.approveReviews) {
      return "COMMENT";
    }

    const eventMap: Record<string, "APPROVE" | "REQUEST_CHANGES" | "COMMENT"> =
      {
        approve: "APPROVE",
        request_changes: "REQUEST_CHANGES",
        comment: "COMMENT",
      };

    return eventMap[action.toLowerCase()] || "COMMENT";
  }
}
