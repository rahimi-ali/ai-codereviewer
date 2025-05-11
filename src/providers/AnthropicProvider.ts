import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AIProviderConfig, ReviewRequest, ReviewResponse } from './AIProvider';
import * as core from '@actions/core';
import { baseCodeReviewPrompt, updateReviewPrompt } from '../prompts';
import { TextBlock } from '@anthropic-ai/sdk/resources';

export class AnthropicProvider implements AIProvider {
  private config!: AIProviderConfig;
  private client!: Anthropic;

  async initialize(config: AIProviderConfig): Promise<void> {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  async review(request: ReviewRequest): Promise<ReviewResponse> {
    core.debug(`Sending request to Anthropic with prompt structure: ${JSON.stringify(request, null, 2)}`);

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: 4000,
      system: this.buildSystemPrompt(request),
      messages: [
        {
          role: 'user',
          content: this.buildPullRequestPrompt(request),
        },
        {
          role: 'user',
          content: 'Return the response in JSON format only, no other text or comments.',
        },
      ],
      temperature: this.config.temperature ?? 0.3,
    });

    core.debug(`Raw Anthropic response: ${JSON.stringify((response.content[0] as TextBlock).text, null, 2)}`);

    const parsedResponse = this.parseResponse(response);
    core.info(`Parsed response: ${JSON.stringify(parsedResponse, null, 2)}`);

    return parsedResponse;
  }

  private buildPullRequestPrompt(request: ReviewRequest): string {
    return JSON.stringify({
      type: 'code_review',
      files: request.files,
      pr: request.pullRequest,
      context: request.context,
      previousReviews: request.previousReviews?.map(review => ({
        summary: review.summary,
        lineComments: review.lineComments.map(comment => ({
          path: comment.path,
          line: comment.line,
          comment: comment.comment
        }))
      }))
    });
  }

  private buildSystemPrompt(request: ReviewRequest): string {
    const isUpdate = request.context.isUpdate;
    return `
      ${baseCodeReviewPrompt}
      ${isUpdate ? updateReviewPrompt : ''}
    `;
  }

  private parseResponse(response: Anthropic.Message): ReviewResponse {
    try {
      const content = JSON.parse((response.content[0] as TextBlock).text);
      return {
        summary: content.summary,
        lineComments: content.comments,
        suggestedAction: content.suggestedAction,
        confidence: content.confidence,
      };
    } catch (error) {
      core.error(`Failed to parse Anthropic response: ${error}`);
      return {
        summary: 'Failed to parse AI response',
        lineComments: [],
        suggestedAction: 'COMMENT',
        confidence: 0,
      };
    }
  }
}
