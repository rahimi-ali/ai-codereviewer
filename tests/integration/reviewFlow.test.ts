import { ReviewService } from "../../src/services/ReviewService";
import { GitHubService } from "../../src/services/GitHubService";
import { DiffService } from "../../src/services/DiffService";
import { OpenAIProvider } from "../../src/providers/OpenAIProvider";
import { Octokit } from "@octokit/rest";

// Mock fetch globally
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    text: () =>
      Promise.resolve(`diff --git a/src/test.ts b/src/test.ts
index abc..def 100644
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,3 +1,4 @@
console.log("test");
+console.log("new line");
console.log("end");`),
  } as Response),
);

// Mock Octokit
jest.mock("@octokit/rest", () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    pulls: {
      get: jest.fn().mockResolvedValue({
        data: {
          number: 123,
          head: { sha: "abc123", ref: "feature" },
          base: { sha: "def456", ref: "main" },
          title: "Test PR",
          body: "Test description",
        },
      }),
      listFiles: jest.fn().mockResolvedValue({
        data: [
          {
            filename: "src/test.ts",
            patch: "test patch",
          },
        ],
      }),
      createReview: jest.fn().mockResolvedValue({
        data: {
          id: 123,
          body: "Test review",
        },
      }),
      listReviews: jest.fn().mockResolvedValue({
        data: [],
      }),
      listReviewComments: jest.fn().mockResolvedValue({
        data: [],
      }),
    },
    repos: {
      getContent: jest.fn().mockResolvedValue({
        data: {
          content: Buffer.from("test content").toString("base64"),
          encoding: "base64",
        },
      }),
    },
  })),
}));

describe("Pull Request Review Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should perform a complete review flow", async () => {
    const githubService = new GitHubService("mock-token");
    const diffService = new DiffService("mock-token", "**/*.md,**/*.json");
    const aiProvider = new OpenAIProvider();
    const reviewService = new ReviewService(
      aiProvider,
      githubService,
      diffService,
      {
        maxComments: 0,
        approveReviews: false,
        projectContext: "",
        contextFiles: [],
      },
    );

    // Mock AI provider
    jest.spyOn(aiProvider, "review").mockResolvedValue({
      summary: "Test review",
      lineComments: [],
      suggestedAction: "COMMENT",
      confidence: 1,
    });

    const result = await reviewService.performReview(123);
    expect(result.summary).toMatch("Code review performed by");
  });
});
