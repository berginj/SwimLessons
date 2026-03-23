/**
 * EventRepository - Telemetry event storage
 * Concrete implementation of IEventRepository using Cosmos DB
 *
 * Container: "events"
 * Partition Key: /cityId
 * TTL: 90 days (auto-delete old events)
 *
 * Responsibilities:
 * - Store high-value telemetry events for analysis
 * - Query events for dashboards and ML training
 * - Provide event counts by type
 */

import { Container } from '@azure/cosmos';
import { IEventRepository, EventQueryFilters } from '@core/contracts/repositories';
import { TelemetryEvent } from '@core/contracts/services';
import { DatabaseError } from '@core/errors/app-errors';

/**
 * EventRepository implementation
 * Handles telemetry event storage and querying in Cosmos DB
 */
export class EventRepository implements IEventRepository {
  /**
   * TTL for events in seconds (90 days)
   */
  private readonly EVENT_TTL_SECONDS = 90 * 24 * 60 * 60;

  constructor(private container: Container) {}

  /**
   * Store a single telemetry event
   * TTL is automatically applied for auto-deletion after 90 days
   *
   * @param event Event to store
   */
  async storeEvent(event: TelemetryEvent): Promise<void> {
    try {
      const eventDocument = this.prepareEventDocument(event);

      await this.container.items.create(eventDocument);
    } catch (error: any) {
      // Log error but don't throw to avoid blocking user operations
      console.error('Error storing event in EventRepository:', error);
      // In production, this might trigger an alert
      throw new DatabaseError('storeEvent', error);
    }
  }

  /**
   * Batch store multiple events (for performance)
   *
   * @param events Events to store
   * @returns Number of events successfully stored
   */
  async batchStoreEvents(events: TelemetryEvent[]): Promise<number> {
    let storedCount = 0;

    try {
      // Use bulk executor pattern or sequential stores
      // For this implementation, we'll use Promise.allSettled to handle partial failures
      const promises = events.map((event) => {
        const eventDocument = this.prepareEventDocument(event);
        return this.container.items.create(eventDocument);
      });

      const results = await Promise.allSettled(promises);

      // Count successful stores
      storedCount = results.filter((r) => r.status === 'fulfilled').length;

      // Log any failures
      results.forEach((result, idx) => {
        if (result.status === 'rejected') {
          console.error(
            `Failed to store event ${idx} in batch:`,
            result.reason
          );
        }
      });

      return storedCount;
    } catch (error) {
      console.error('Error batch storing events:', error);
      throw new DatabaseError('batchStoreEvents', error as Error);
    }
  }

  /**
   * Query events for analysis
   * Supports filtering by event name, date range, session ID, user ID
   *
   * @param cityId City ID (partition key)
   * @param filters Event filters
   * @param limit Max results to return
   * @returns Array of events matching filters
   */
  async queryEvents(
    cityId: string,
    filters: EventQueryFilters,
    limit: number = 1000
  ): Promise<TelemetryEvent[]> {
    try {
      let query = 'SELECT * FROM c WHERE c.cityId = @cityId AND c.type = @type';
      const parameters = [
        { name: '@cityId', value: cityId },
        { name: '@type', value: 'EventDocument' },
      ];

      // Filter by event names
      if (filters.eventNames && filters.eventNames.length > 0) {
        const eventPlaceholders = filters.eventNames
          .map((_, idx) => `@eventName${idx}`)
          .join(',');
        query += ` AND c.eventName IN (${eventPlaceholders})`;
        filters.eventNames.forEach((eventName, idx) => {
          parameters.push({ name: `@eventName${idx}`, value: eventName });
        });
      }

      // Filter by date range
      if (filters.startDate) {
        query += ' AND c.timestamp >= @startDate';
        parameters.push({ name: '@startDate', value: filters.startDate });
      }

      if (filters.endDate) {
        query += ' AND c.timestamp <= @endDate';
        parameters.push({ name: '@endDate', value: filters.endDate });
      }

      // Filter by session ID
      if (filters.sessionId) {
        query += ' AND c.sessionId = @sessionId';
        parameters.push({ name: '@sessionId', value: filters.sessionId });
      }

      // Filter by user ID
      if (filters.userId) {
        query += ' AND c.userId = @userId';
        parameters.push({ name: '@userId', value: filters.userId });
      }

      // Add ordering and limit
      query += ' ORDER BY c.timestamp DESC';
      query += ` OFFSET 0 LIMIT ${limit}`;

      const { resources } = await this.container.items
        .query<TelemetryEvent>({
          query,
          parameters,
        })
        .fetchAll();

      return resources;
    } catch (error) {
      throw new DatabaseError('queryEvents', error as Error);
    }
  }

  /**
   * Get event counts by type for dashboards
   *
   * @param cityId City ID (partition key)
   * @param startDate Start date in ISO format
   * @param endDate End date in ISO format
   * @returns Map of event name to count
   */
  async getEventCounts(
    cityId: string,
    startDate: string,
    endDate: string
  ): Promise<Map<string, number>> {
    try {
      const query = `
        SELECT
          c.eventName,
          COUNT(1) as count
        FROM c
        WHERE c.cityId = @cityId
          AND c.type = @type
          AND c.timestamp >= @startDate
          AND c.timestamp <= @endDate
        GROUP BY c.eventName
      `;

      const parameters = [
        { name: '@cityId', value: cityId },
        { name: '@type', value: 'EventDocument' },
        { name: '@startDate', value: startDate },
        { name: '@endDate', value: endDate },
      ];

      const { resources } = await this.container.items
        .query<{ eventName: string; count: number }>({
          query,
          parameters,
        })
        .fetchAll();

      // Convert results to Map
      const counts = new Map<string, number>();
      resources.forEach((result) => {
        counts.set(result.eventName, result.count);
      });

      return counts;
    } catch (error) {
      throw new DatabaseError('getEventCounts', error as Error);
    }
  }

  /**
   * Prepare event document for storage
   * Adds metadata, IDs, timestamps, and TTL
   *
   * @param event Telemetry event
   * @returns Prepared document for Cosmos DB
   */
  private prepareEventDocument(event: TelemetryEvent): any {
    const now = new Date().toISOString();
    const documentId = `${event.eventName}-${event.sessionId}-${Date.now()}`;

    return {
      id: documentId,
      type: 'EventDocument',
      // All event fields
      ...event,
      // Metadata
      createdAt: now,
      // TTL in seconds for auto-deletion (90 days)
      ttl: this.EVENT_TTL_SECONDS,
    };
  }
}
