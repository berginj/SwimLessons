/**
 * SessionRepository - Session and related entity storage
 * Concrete implementation of ISessionRepository using Cosmos DB
 *
 * This repository handles four document types in a single container:
 * - Session: Specific enrollable instances (the primary entity)
 * - Provider: Organizations offering sessions
 * - Location: Physical facilities where sessions occur
 * - Program: Recurring offerings at locations
 *
 * Container: "sessions"
 * Partition Key: /cityId
 */

import { Container } from '@azure/cosmos';
import { ISessionRepository, SessionQueryFilters } from '@core/contracts/repositories';
import {
  Session,
  Provider,
  Location,
  Program,
} from '@core/models/canonical-schema';
import { DatabaseError } from '@core/errors/app-errors';

/**
 * Session Repository implementation
 * Handles CRUD operations for sessions and related entities (providers, locations, programs)
 */
export class SessionRepository implements ISessionRepository {
  constructor(private container: Container) {}

  // ========== SESSION OPERATIONS ==========

  /**
   * Get session by ID
   *
   * @param sessionId Session ID
   * @param cityId City ID (partition key)
   * @returns Session or null if not found
   */
  async getSessionById(sessionId: string, cityId: string): Promise<Session | null> {
    try {
      const { resource } = await this.container
        .item(sessionId, cityId)
        .read<Session>();

      return resource || null;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw new DatabaseError('getSessionById', error);
    }
  }

  /**
   * Query sessions with filters
   * This is the core search query method optimized for Cosmos DB with indexed paths
   *
   * @param cityId City ID (partition key)
   * @param filters Search filters (startDate, daysOfWeek, geographyIds, etc.)
   * @param limit Max results to return (default: 100)
   * @returns Array of sessions matching the filters
   */
  async querySessions(
    cityId: string,
    filters: SessionQueryFilters,
    limit: number = 100
  ): Promise<Session[]> {
    try {
      let query = 'SELECT * FROM c WHERE c.type = @type AND c.cityId = @cityId';
      const parameters = [
        { name: '@type', value: 'SessionDocument' },
        { name: '@cityId', value: cityId },
      ];

      // Apply date range filter (startDate between min and max)
      if (filters.startDateMin) {
        query += ' AND c.startDate >= @startDateMin';
        parameters.push({ name: '@startDateMin', value: filters.startDateMin });
      }

      if (filters.startDateMax) {
        query += ' AND c.startDate <= @startDateMax';
        parameters.push({ name: '@startDateMax', value: filters.startDateMax });
      }

      // Apply days of week filter (check if session daysOfWeek overlaps with filter)
      if (filters.daysOfWeek && filters.daysOfWeek.length > 0) {
        // Build dynamic IN clause for days of week
        const dayPlaceholders = filters.daysOfWeek
          .map((_, idx) => `@day${idx}`)
          .join(',');
        query += ` AND ARRAY_CONTAINS(c.daysOfWeek, @dayFilter, true)`;

        // For Cosmos DB, we need to check if any day matches
        // This requires a more complex query with ARRAY_CONCAT or multiple conditions
        // Using a simpler approach: check if the session has any of the requested days
        const dayConditions = filters.daysOfWeek
          .map((day, idx) => {
            parameters.push({ name: `@day${idx}`, value: day });
            return `ARRAY_CONTAINS(c.daysOfWeek, @day${idx})`;
          })
          .join(' OR ');
        query = query.replace('AND ARRAY_CONTAINS(c.daysOfWeek, @dayFilter, true)', `AND (${dayConditions})`);
      }

      // Apply geography filter (geographyIds)
      if (filters.geographyIds && filters.geographyIds.length > 0) {
        const geoPlaceholders = filters.geographyIds
          .map((_, idx) => `@geo${idx}`)
          .join(',');
        query += ` AND ARRAY_CONCAT(c.geographyIds) IN (${geoPlaceholders})`;
        filters.geographyIds.forEach((geoId, idx) => {
          parameters.push({ name: `@geo${idx}`, value: geoId });
        });
      }

      // Apply provider filter (providerIds)
      if (filters.providerIds && filters.providerIds.length > 0) {
        const provPlaceholders = filters.providerIds
          .map((_, idx) => `@prov${idx}`)
          .join(',');
        query += ` AND c.providerId IN (${provPlaceholders})`;
        filters.providerIds.forEach((providerId, idx) => {
          parameters.push({ name: `@prov${idx}`, value: providerId });
        });
      }

      // Apply registration open filter
      if (filters.registrationOpen !== undefined) {
        query += ' AND c.registrationOpen = @registrationOpen';
        parameters.push({ name: '@registrationOpen', value: filters.registrationOpen as any });
      }

      // Add limit and optimize for performance
      query += ` ORDER BY c.startDate ASC OFFSET 0 LIMIT ${limit}`;

      const { resources } = await this.container.items
        .query<Session>({
          query,
          parameters,
        })
        .fetchAll();

      return resources;
    } catch (error) {
      throw new DatabaseError('querySessions', error as Error);
    }
  }

  /**
   * Create session
   *
   * @param session Session to create
   * @returns Created session with timestamps
   */
  async createSession(session: Session): Promise<Session> {
    try {
      // Ensure timestamps
      const now = new Date().toISOString();
      const sessionWithTimestamps: Session = {
        ...session,
        createdAt: session.createdAt || now,
        updatedAt: now,
        lastSyncedAt: session.lastSyncedAt || now,
        type: 'SessionDocument', // Ensure type is set
      };

      const { resource } = await this.container.items.create<Session>(
        sessionWithTimestamps
      );

      if (!resource) {
        throw new Error('Failed to create session - no resource returned');
      }

      return resource;
    } catch (error: any) {
      if (error.code === 409) {
        throw new DatabaseError(
          'createSession',
          new Error(`Session with id '${session.id}' already exists`)
        );
      }
      throw new DatabaseError('createSession', error);
    }
  }

  /**
   * Update session
   *
   * @param sessionId Session ID
   * @param cityId City ID (partition key)
   * @param updates Partial session updates
   * @returns Updated session
   */
  async updateSession(
    sessionId: string,
    cityId: string,
    updates: Partial<Session>
  ): Promise<Session> {
    try {
      // Get existing session
      const existing = await this.getSessionById(sessionId, cityId);
      if (!existing) {
        throw new Error(`Session '${sessionId}' not found`);
      }

      // Merge updates
      const updated: Session = {
        ...existing,
        ...updates,
        id: sessionId, // Ensure ID doesn't change
        cityId, // Ensure partition key doesn't change
        type: 'SessionDocument', // Ensure type doesn't change
        createdAt: existing.createdAt, // Preserve creation timestamp
        updatedAt: new Date().toISOString(), // Update modification timestamp
      };

      const { resource } = await this.container
        .item(sessionId, cityId)
        .replace<Session>(updated);

      if (!resource) {
        throw new Error('Failed to update session - no resource returned');
      }

      return resource;
    } catch (error) {
      throw new DatabaseError('updateSession', error as Error);
    }
  }

  /**
   * Delete session
   *
   * @param sessionId Session ID
   * @param cityId City ID (partition key)
   */
  async deleteSession(sessionId: string, cityId: string): Promise<void> {
    try {
      await this.container.item(sessionId, cityId).delete();
    } catch (error: any) {
      if (error.code === 404) {
        // Already deleted, ignore
        return;
      }
      throw new DatabaseError('deleteSession', error);
    }
  }

  /**
   * Batch upsert sessions (for data sync)
   * Efficiently handles large syncs by using bulk operations
   *
   * @param sessions Sessions to upsert
   * @returns Number of sessions upserted
   */
  async batchUpsertSessions(sessions: Session[]): Promise<number> {
    try {
      if (!sessions || sessions.length === 0) {
        return 0;
      }

      const now = new Date().toISOString();
      let upsertCount = 0;

      // Process sessions in batches for better performance
      // Cosmos DB has a limit on transactional batch size (typically 100 items)
      const batchSize = 100;

      for (let i = 0; i < sessions.length; i += batchSize) {
        const batch = sessions.slice(i, i + batchSize);

        // Prepare sessions with timestamps
        const sessionsWithTimestamps = batch.map((session) => ({
          ...session,
          type: 'SessionDocument' as const,
          createdAt: session.createdAt || now,
          updatedAt: now,
          lastSyncedAt: now,
        }));

        // Create or replace each session
        for (const session of sessionsWithTimestamps) {
          try {
            await this.container.items.upsert<Session>(session);
            upsertCount++;
          } catch (itemError: any) {
            // Log the error but continue processing other items
            // In production, you might want to collect these errors
            console.error(`Failed to upsert session ${session.id}:`, itemError);
          }
        }
      }

      return upsertCount;
    } catch (error) {
      throw new DatabaseError('batchUpsertSessions', error as Error);
    }
  }

  // ========== PROVIDER OPERATIONS ==========

  /**
   * Get provider by ID
   *
   * @param providerId Provider ID
   * @param cityId City ID (partition key)
   * @returns Provider or null if not found
   */
  async getProviderById(providerId: string, cityId: string): Promise<Provider | null> {
    try {
      const { resource } = await this.container
        .item(providerId, cityId)
        .read<Provider>();

      return resource || null;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw new DatabaseError('getProviderById', error);
    }
  }

  /**
   * List providers for a city
   *
   * @param cityId City ID
   * @returns Array of all providers in the city
   */
  async listProviders(cityId: string): Promise<Provider[]> {
    try {
      const query = 'SELECT * FROM c WHERE c.type = @type AND c.cityId = @cityId ORDER BY c.name ASC';
      const parameters = [
        { name: '@type', value: 'ProviderDocument' },
        { name: '@cityId', value: cityId },
      ];

      const { resources } = await this.container.items
        .query<Provider>({
          query,
          parameters,
        })
        .fetchAll();

      return resources;
    } catch (error) {
      throw new DatabaseError('listProviders', error as Error);
    }
  }

  /**
   * Create provider
   *
   * @param provider Provider to create
   * @returns Created provider with timestamps
   */
  async createProvider(provider: Provider): Promise<Provider> {
    try {
      const now = new Date().toISOString();
      const providerWithTimestamps: Provider = {
        ...provider,
        createdAt: provider.createdAt || now,
        updatedAt: now,
        type: 'ProviderDocument', // Ensure type is set
      };

      const { resource } = await this.container.items.create<Provider>(
        providerWithTimestamps
      );

      if (!resource) {
        throw new Error('Failed to create provider - no resource returned');
      }

      return resource;
    } catch (error: any) {
      if (error.code === 409) {
        throw new DatabaseError(
          'createProvider',
          new Error(`Provider with id '${provider.id}' already exists`)
        );
      }
      throw new DatabaseError('createProvider', error);
    }
  }

  /**
   * Update provider
   *
   * @param providerId Provider ID
   * @param cityId City ID (partition key)
   * @param updates Partial provider updates
   * @returns Updated provider
   */
  async updateProvider(
    providerId: string,
    cityId: string,
    updates: Partial<Provider>
  ): Promise<Provider> {
    try {
      // Get existing provider
      const existing = await this.getProviderById(providerId, cityId);
      if (!existing) {
        throw new Error(`Provider '${providerId}' not found`);
      }

      // Merge updates
      const updated: Provider = {
        ...existing,
        ...updates,
        id: providerId, // Ensure ID doesn't change
        cityId, // Ensure partition key doesn't change
        type: 'ProviderDocument', // Ensure type doesn't change
        createdAt: existing.createdAt, // Preserve creation timestamp
        updatedAt: new Date().toISOString(), // Update modification timestamp
      };

      const { resource } = await this.container
        .item(providerId, cityId)
        .replace<Provider>(updated);

      if (!resource) {
        throw new Error('Failed to update provider - no resource returned');
      }

      return resource;
    } catch (error) {
      throw new DatabaseError('updateProvider', error as Error);
    }
  }

  /**
   * Delete provider
   *
   * @param providerId Provider ID
   * @param cityId City ID (partition key)
   */
  async deleteProvider(providerId: string, cityId: string): Promise<void> {
    try {
      await this.container.item(providerId, cityId).delete();
    } catch (error: any) {
      if (error.code === 404) {
        // Already deleted, ignore
        return;
      }
      throw new DatabaseError('deleteProvider', error);
    }
  }

  // ========== LOCATION OPERATIONS ==========

  /**
   * Get location by ID
   *
   * @param locationId Location ID
   * @param cityId City ID (partition key)
   * @returns Location or null if not found
   */
  async getLocationById(locationId: string, cityId: string): Promise<Location | null> {
    try {
      const { resource } = await this.container
        .item(locationId, cityId)
        .read<Location>();

      return resource || null;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw new DatabaseError('getLocationById', error);
    }
  }

  /**
   * List locations for a city
   *
   * @param cityId City ID
   * @param providerId Optional filter by provider
   * @returns Array of locations
   */
  async listLocations(cityId: string, providerId?: string): Promise<Location[]> {
    try {
      let query = 'SELECT * FROM c WHERE c.type = @type AND c.cityId = @cityId';
      const parameters = [
        { name: '@type', value: 'LocationDocument' },
        { name: '@cityId', value: cityId },
      ];

      // Apply provider filter if provided
      if (providerId) {
        query += ' AND c.providerId = @providerId';
        parameters.push({ name: '@providerId', value: providerId });
      }

      query += ' ORDER BY c.name ASC';

      const { resources } = await this.container.items
        .query<Location>({
          query,
          parameters,
        })
        .fetchAll();

      return resources;
    } catch (error) {
      throw new DatabaseError('listLocations', error as Error);
    }
  }

  /**
   * Create location
   *
   * @param location Location to create
   * @returns Created location with timestamps
   */
  async createLocation(location: Location): Promise<Location> {
    try {
      const now = new Date().toISOString();
      const locationWithTimestamps: Location = {
        ...location,
        createdAt: location.createdAt || now,
        updatedAt: now,
        type: 'LocationDocument', // Ensure type is set
      };

      const { resource } = await this.container.items.create<Location>(
        locationWithTimestamps
      );

      if (!resource) {
        throw new Error('Failed to create location - no resource returned');
      }

      return resource;
    } catch (error: any) {
      if (error.code === 409) {
        throw new DatabaseError(
          'createLocation',
          new Error(`Location with id '${location.id}' already exists`)
        );
      }
      throw new DatabaseError('createLocation', error);
    }
  }

  /**
   * Update location
   *
   * @param locationId Location ID
   * @param cityId City ID (partition key)
   * @param updates Partial location updates
   * @returns Updated location
   */
  async updateLocation(
    locationId: string,
    cityId: string,
    updates: Partial<Location>
  ): Promise<Location> {
    try {
      // Get existing location
      const existing = await this.getLocationById(locationId, cityId);
      if (!existing) {
        throw new Error(`Location '${locationId}' not found`);
      }

      // Merge updates
      const updated: Location = {
        ...existing,
        ...updates,
        id: locationId, // Ensure ID doesn't change
        cityId, // Ensure partition key doesn't change
        type: 'LocationDocument', // Ensure type doesn't change
        createdAt: existing.createdAt, // Preserve creation timestamp
        updatedAt: new Date().toISOString(), // Update modification timestamp
      };

      const { resource } = await this.container
        .item(locationId, cityId)
        .replace<Location>(updated);

      if (!resource) {
        throw new Error('Failed to update location - no resource returned');
      }

      return resource;
    } catch (error) {
      throw new DatabaseError('updateLocation', error as Error);
    }
  }

  /**
   * Delete location
   *
   * @param locationId Location ID
   * @param cityId City ID (partition key)
   */
  async deleteLocation(locationId: string, cityId: string): Promise<void> {
    try {
      await this.container.item(locationId, cityId).delete();
    } catch (error: any) {
      if (error.code === 404) {
        // Already deleted, ignore
        return;
      }
      throw new DatabaseError('deleteLocation', error);
    }
  }

  // ========== PROGRAM OPERATIONS ==========

  /**
   * Get program by ID
   *
   * @param programId Program ID
   * @param cityId City ID (partition key)
   * @returns Program or null if not found
   */
  async getProgramById(programId: string, cityId: string): Promise<Program | null> {
    try {
      const { resource } = await this.container
        .item(programId, cityId)
        .read<Program>();

      return resource || null;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw new DatabaseError('getProgramById', error);
    }
  }

  /**
   * List programs for a city or location
   *
   * @param cityId City ID
   * @param locationId Optional filter by location
   * @returns Array of programs
   */
  async listPrograms(cityId: string, locationId?: string): Promise<Program[]> {
    try {
      let query = 'SELECT * FROM c WHERE c.type = @type AND c.cityId = @cityId';
      const parameters = [
        { name: '@type', value: 'ProgramDocument' },
        { name: '@cityId', value: cityId },
      ];

      // Apply location filter if provided
      if (locationId) {
        query += ' AND c.locationId = @locationId';
        parameters.push({ name: '@locationId', value: locationId });
      }

      query += ' ORDER BY c.name ASC';

      const { resources } = await this.container.items
        .query<Program>({
          query,
          parameters,
        })
        .fetchAll();

      return resources;
    } catch (error) {
      throw new DatabaseError('listPrograms', error as Error);
    }
  }

  /**
   * Create program
   *
   * @param program Program to create
   * @returns Created program with timestamps
   */
  async createProgram(program: Program): Promise<Program> {
    try {
      const now = new Date().toISOString();
      const programWithTimestamps: Program = {
        ...program,
        createdAt: program.createdAt || now,
        updatedAt: now,
        type: 'ProgramDocument', // Ensure type is set
      };

      const { resource } = await this.container.items.create<Program>(
        programWithTimestamps
      );

      if (!resource) {
        throw new Error('Failed to create program - no resource returned');
      }

      return resource;
    } catch (error: any) {
      if (error.code === 409) {
        throw new DatabaseError(
          'createProgram',
          new Error(`Program with id '${program.id}' already exists`)
        );
      }
      throw new DatabaseError('createProgram', error);
    }
  }

  /**
   * Update program
   *
   * @param programId Program ID
   * @param cityId City ID (partition key)
   * @param updates Partial program updates
   * @returns Updated program
   */
  async updateProgram(
    programId: string,
    cityId: string,
    updates: Partial<Program>
  ): Promise<Program> {
    try {
      // Get existing program
      const existing = await this.getProgramById(programId, cityId);
      if (!existing) {
        throw new Error(`Program '${programId}' not found`);
      }

      // Merge updates
      const updated: Program = {
        ...existing,
        ...updates,
        id: programId, // Ensure ID doesn't change
        cityId, // Ensure partition key doesn't change
        type: 'ProgramDocument', // Ensure type doesn't change
        createdAt: existing.createdAt, // Preserve creation timestamp
        updatedAt: new Date().toISOString(), // Update modification timestamp
      };

      const { resource } = await this.container
        .item(programId, cityId)
        .replace<Program>(updated);

      if (!resource) {
        throw new Error('Failed to update program - no resource returned');
      }

      return resource;
    } catch (error) {
      throw new DatabaseError('updateProgram', error as Error);
    }
  }

  /**
   * Delete program
   *
   * @param programId Program ID
   * @param cityId City ID (partition key)
   */
  async deleteProgram(programId: string, cityId: string): Promise<void> {
    try {
      await this.container.item(programId, cityId).delete();
    } catch (error: any) {
      if (error.code === 404) {
        // Already deleted, ignore
        return;
      }
      throw new DatabaseError('deleteProgram', error);
    }
  }
}
