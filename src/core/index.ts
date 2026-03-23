/**
 * Core module exports
 * Central export point for all core contracts, models, and errors
 */

// Contracts
export * from './contracts/city-config';
export * from './contracts/city-adapter';
export * from './contracts/repositories';
export * from './contracts/api-contracts';

// Models
export * from './models/canonical-schema';

// Services (exported separately to avoid naming conflicts)
export type {
  ISearchService,
  ICityConfigService,
  IFeatureFlagService,
  ITelemetryService,
  ITransitService,
  IOnboardingService,
  IDataSyncService,
  SortOptions,
  PaginationOptions,
  FeatureFlagContext,
  TelemetryEvent,
  SearchStartedEvent,
  SearchResultsEvent,
  SessionViewedEvent,
  SignupClickedEvent,
  NoResultsEvent,
  ErrorEvent,
  OnboardingRequest,
  OnboardingSession,
  OnboardingStatus,
} from './contracts/services';

// Errors
export * from './errors/app-errors';
