import { GenerativeModel, GoogleGenerativeAI } from "@google/generative-ai";
import {
  AIProvider,
  AIProviderConfig,
  ReviewRequest,
  ReviewResponse,
} from "./AIProvider";
import * as core from "@actions/core";
import { baseCodeReviewPrompt, updateReviewPrompt } from "../prompts";

export class GeminiProvider implements AIProvider {
  private config!: AIProviderConfig;
  private client!: GoogleGenerativeAI;
  private model!: GenerativeModel;

  async initialize(config: AIProviderConfig): Promise<void> {
    this.config = config;
    this.client = new GoogleGenerativeAI(config.apiKey);
    this.model = this.client.getGenerativeModel({
      model: this.config.model,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });
  }

  async review(request: ReviewRequest): Promise<ReviewResponse> {
    core.debug(
      `Sending request to Gemini with prompt structure: ${JSON.stringify(request, null, 2)}`,
    );

    const result = await this.model.generateContent({
      systemInstruction: this.buildSystemPrompt(request),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: this.buildPullRequestPrompt(request),
            },
          ],
        },
      ],
    });

    const response = result.response;
    core.debug(
      `Raw Gemini response: ${JSON.stringify(response.text(), null, 2)}`,
    );

    const parsedResponse = this.parseResponse(response);
    core.info(`Parsed response: ${JSON.stringify(parsedResponse, null, 2)}`);

    return parsedResponse;
  }

  private buildPullRequestPrompt(request: ReviewRequest): string {
    return JSON.stringify({
      type: "code_review",
      files: request.files,
      pr: request.pullRequest,
      context: request.context,
      previousReviews: request.previousReviews?.map((review) => ({
        summary: review.summary,
        lineComments: review.lineComments.map((comment) => ({
          path: comment.path,
          line: comment.line,
          comment: comment.comment,
        })),
      })),
    });
  }

  private buildSystemPrompt(request: ReviewRequest): string {
    const isUpdate = request.context.isUpdate;
    return `
      ${baseCodeReviewPrompt}
      ${isUpdate ? updateReviewPrompt : ""}
    `;
  }

  private parseResponse(response: any): ReviewResponse {
    try {
      const content = JSON.parse(response.text());
      return {
        summary: content.summary,
        lineComments: content.comments,
        suggestedAction: content.suggestedAction,
        confidence: content.confidence,
      };
    } catch (error) {
      core.error(`Failed to parse Gemini response: ${error}`);
      return {
        summary: "Failed to parse AI response",
        lineComments: [],
        suggestedAction: "COMMENT",
        confidence: 0,
      };
    }
  }
}
