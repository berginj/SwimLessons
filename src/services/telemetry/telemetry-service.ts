/**
 * TelemetryService - Application Insights + Cosmos DB event tracking
 * Concrete implementation of ITelemetryService
 *
 * Responsibilities:
 * - Track user events to Application Insights (synchronous)
 * - Persist high-value events to Cosmos DB (fire-and-forget)
 * - Support custom metrics and events
 *
 * Fire-and-forget pattern: All Cosmos DB writes are non-blocking
 */

import { TelemetryClient } from 'applicationinsights';
import {
  ITelemetryService,
  TelemetryEvent,
  SearchStartedEvent,
  SearchResultsEvent,
  SessionViewedEvent,
  SignupClickedEvent,
  NoResultsEvent,
  ErrorEvent,
} from '@core/contracts/services';
import { IEventRepository } from '@core/contracts/repositories';

/**
 * TelemetryService implementation with Application Insights + Cosmos DB
 */
export class TelemetryService implements ITelemetryService {
  constructor(
    private appInsightsClient: TelemetryClient,
    private eventRepository: IEventRepository
  ) {}

  /**
   * Track a generic event
   * Sends to Application Insights and persists high-value events to Cosmos DB
   *
   * @param event Event to track
   */
  async trackEvent(event: TelemetryEvent): Promise<void> {
    // Send to Application Insights (synchronous)
    this.appInsightsClient.trackEvent({
      name: event.eventName,
      properties: {
        sessionId: event.sessionId,
        cityId: event.cityId,
        userId: event.userId,
        platform: event.platform,
        timestamp: event.timestamp,
        ...(event.experiments && { experiments: JSON.stringify(event.experiments) }),
      },
    });

    // Persist to Cosmos DB (fire-and-forget)
    this.persistEventToCosmosDb(event);
  }

  /**
   * Track search started event
   *
   * @param event Search started event
   */
  async trackSearchStarted(event: SearchStartedEvent): Promise<void> {
    // Send to Application Insights
    this.appInsightsClient.trackEvent({
      name: event.eventName,
      properties: {
        sessionId: event.sessionId,
        cityId: event.cityId,
        userId: event.userId,
        platform: event.platform,
        hasLocation: String(event.hasLocation),
        filterCount: String(Object.keys(event.filters).length),
        timestamp: event.timestamp,
      },
    });

    // Persist to Cosmos DB (fire-and-forget)
    this.persistEventToCosmosDb(event);
  }

  /**
   * Track search results returned event
   *
   * @param event Search results event
   */
  async trackSearchResults(event: SearchResultsEvent): Promise<void> {
    // Send to Application Insights
    this.appInsightsClient.trackEvent({
      name: event.eventName,
      properties: {
        sessionId: event.sessionId,
        cityId: event.cityId,
        userId: event.userId,
        platform: event.platform,
        resultCount: String(event.resultCount),
        executionTimeMs: String(event.executionTimeMs),
        relaxationApplied: String(event.relaxationApplied),
        timestamp: event.timestamp,
      },
    });

    // Also track as metric
    this.appInsightsClient.trackMetric({
      name: 'search_execution_time_ms',
      value: event.executionTimeMs,
      properties: {
        cityId: event.cityId,
        relaxationApplied: String(event.relaxationApplied),
      },
    });

    // Persist to Cosmos DB (fire-and-forget)
    this.persistEventToCosmosDb(event);
  }

  /**
   * Track session viewed event
   *
   * @param event Session viewed event
   */
  async trackSessionViewed(event: SessionViewedEvent): Promise<void> {
    // Send to Application Insights
    this.appInsightsClient.trackEvent({
      name: event.eventName,
      properties: {
        sessionId: event.sessionId,
        cityId: event.cityId,
        userId: event.userId,
        platform: event.platform,
        position: String(event.position),
        distance: event.distance ? String(event.distance) : undefined,
        price: event.price ? String(event.price) : undefined,
        timestamp: event.timestamp,
      },
    });

    // Persist to Cosmos DB (fire-and-forget)
    this.persistEventToCosmosDb(event);
  }

  /**
   * Track signup clicked event
   *
   * @param event Signup clicked event
   */
  async trackSignupClicked(event: SignupClickedEvent): Promise<void> {
    // Send to Application Insights
    this.appInsightsClient.trackEvent({
      name: event.eventName,
      properties: {
        sessionId: event.sessionId,
        cityId: event.cityId,
        userId: event.userId,
        platform: event.platform,
        destinationUrl: event.destinationUrl,
        searchToClickDurationMs: String(event.searchToClickDurationMs),
        sessionsViewedBefore: String(event.sessionsViewedBefore),
        timestamp: event.timestamp,
      },
    });

    // Track metric for conversion funnel
    this.appInsightsClient.trackMetric({
      name: 'signup_click',
      value: 1,
      properties: {
        cityId: event.cityId,
        sessionsViewedBefore: String(event.sessionsViewedBefore),
      },
    });

    // Persist to Cosmos DB (fire-and-forget)
    this.persistEventToCosmosDb(event);
  }

  /**
   * Track no results event
   *
   * @param event No results event
   */
  async trackNoResults(event: NoResultsEvent): Promise<void> {
    // Send to Application Insights
    this.appInsightsClient.trackEvent({
      name: event.eventName,
      properties: {
        sessionId: event.sessionId,
        cityId: event.cityId,
        userId: event.userId,
        platform: event.platform,
        relaxationAttempted: String(event.relaxationAttempted),
        relaxationSucceeded: String(event.relaxationSucceeded),
        requestedGeographyIds: event.requestedGeographyIds
          ? event.requestedGeographyIds.join(',')
          : undefined,
        timestamp: event.timestamp,
      },
    });

    // Track metric for monitoring
    this.appInsightsClient.trackMetric({
      name: 'no_results',
      value: 1,
      properties: {
        cityId: event.cityId,
        relaxationAttempted: String(event.relaxationAttempted),
        relaxationSucceeded: String(event.relaxationSucceeded),
      },
    });

    // Persist to Cosmos DB (fire-and-forget) - this is especially valuable for analysis
    this.persistEventToCosmosDb(event);
  }

  /**
   * Track error event
   *
   * @param error Error event
   */
  async trackError(error: ErrorEvent): Promise<void> {
    // Send to Application Insights with proper error tracking
    this.appInsightsClient.trackException({
      exception: new Error(error.errorMessage),
      properties: {
        sessionId: error.sessionId,
        cityId: error.cityId,
        userId: error.userId,
        platform: error.platform,
        operation: error.operation,
        errorType: error.errorType,
        stackTrace: error.stackTrace,
        timestamp: error.timestamp,
        severity: String(this.mapErrorTypeToSeverity(error.errorType)),
      },
    });

    // Track metric
    this.appInsightsClient.trackMetric({
      name: 'error_count',
      value: 1,
      properties: {
        cityId: error.cityId,
        errorType: error.errorType,
        operation: error.operation,
      },
    });

    // Persist to Cosmos DB (fire-and-forget)
    this.persistEventToCosmosDb(error);
  }

  /**
   * Track custom metric
   *
   * @param metricName Metric name
   * @param value Metric value
   * @param properties Additional properties
   */
  async trackMetric(
    metricName: string,
    value: number,
    properties?: Record<string, string>
  ): Promise<void> {
    this.appInsightsClient.trackMetric({
      name: metricName,
      value,
      properties,
    });
  }

  /**
   * Persist event to Cosmos DB (fire-and-forget pattern)
   * Errors are silently logged to avoid blocking main request
   *
   * @param event Event to persist
   */
  private persistEventToCosmosDb(event: TelemetryEvent): void {
    // Fire-and-forget: don't await, don't block
    this.eventRepository
      .storeEvent(event)
      .catch((error) => {
        // Log error but don't throw - telemetry failures shouldn't affect user experience
        console.error(
          `Failed to persist event ${event.eventName} to Cosmos DB:`,
          error
        );
      });
  }

  /**
   * Map error types to Application Insights severity levels
   *
   * @param errorType Error type
   * @returns Severity level
   */
  private mapErrorTypeToSeverity(
    errorType: string
  ): number {
    switch (errorType.toLowerCase()) {
      case 'critical':
      case 'fatal':
        return 0; // Critical
      case 'error':
        return 1; // Error
      case 'warning':
        return 2; // Warning
      case 'info':
        return 3; // Information
      case 'verbose':
        return 4; // Verbose
      default:
        return 1; // Default to error
    }
  }
}
