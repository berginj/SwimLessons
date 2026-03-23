/**
 * TenantRepository - City configuration storage
 * Concrete implementation of ITenantRepository using Cosmos DB
 */

import { Container } from '@azure/cosmos';
import { ITenantRepository, TenantFilter } from '@core/contracts/repositories';
import { TenantCatalog } from '@core/contracts/city-config';
import { DatabaseError } from '@core/errors/app-errors';

/**
 * Tenant Repository implementation
 * Container: "tenants"
 * Partition Key: /id (cityId)
 */
export class TenantRepository implements ITenantRepository {
  constructor(private container: Container) {}

  async getById(cityId: string): Promise<TenantCatalog | null> {
    try {
      const { resource } = await this.container
        .item(cityId, cityId) // id, partitionKey
        .read<TenantCatalog>();

      return resource || null;
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw new DatabaseError('getById', error);
    }
  }

  async list(filter?: TenantFilter): Promise<TenantCatalog[]> {
    try {
      let query = 'SELECT * FROM c WHERE c.type = @type';
      const parameters = [{ name: '@type', value: 'CityConfig' }];

      // Apply filters
      if (filter?.status) {
        query += ' AND c.status = @status';
        parameters.push({ name: '@status', value: filter.status });
      }

      if (filter?.stampId) {
        query += ' AND c.stampId = @stampId';
        parameters.push({ name: '@stampId', value: filter.stampId });
      }

      const { resources } = await this.container.items
        .query<TenantCatalog>({
          query,
          parameters,
        })
        .fetchAll();

      return resources;
    } catch (error) {
      throw new DatabaseError('list', error as Error);
    }
  }

  async create(tenant: TenantCatalog): Promise<TenantCatalog> {
    try {
      // Ensure timestamps
      const now = new Date().toISOString();
      const tenantWithTimestamps: TenantCatalog = {
        ...tenant,
        onboardedAt: tenant.onboardedAt || now,
        cityConfig: {
          ...tenant.cityConfig,
          onboardedAt: tenant.cityConfig.onboardedAt || now,
          updatedAt: now,
        },
      };

      const { resource } = await this.container.items.create<TenantCatalog>(
        tenantWithTimestamps
      );

      if (!resource) {
        throw new Error('Failed to create tenant - no resource returned');
      }

      return resource;
    } catch (error: any) {
      if (error.code === 409) {
        throw new DatabaseError(
          'create',
          new Error(`Tenant with id '${tenant.id}' already exists`)
        );
      }
      throw new DatabaseError('create', error);
    }
  }

  async update(cityId: string, updates: Partial<TenantCatalog>): Promise<TenantCatalog> {
    try {
      // Get existing tenant
      const existing = await this.getById(cityId);
      if (!existing) {
        throw new Error(`Tenant '${cityId}' not found`);
      }

      // Merge updates
      const updated: TenantCatalog = {
        ...existing,
        ...updates,
        id: cityId, // Ensure ID doesn't change
        type: 'CityConfig', // Ensure type doesn't change
        cityConfig: updates.cityConfig
          ? {
              ...existing.cityConfig,
              ...updates.cityConfig,
              cityId, // Ensure cityId doesn't change
              updatedAt: new Date().toISOString(),
            }
          : existing.cityConfig,
      };

      const { resource } = await this.container
        .item(cityId, cityId)
        .replace<TenantCatalog>(updated);

      if (!resource) {
        throw new Error('Failed to update tenant - no resource returned');
      }

      return resource;
    } catch (error) {
      throw new DatabaseError('update', error as Error);
    }
  }

  async delete(cityId: string): Promise<void> {
    try {
      await this.container.item(cityId, cityId).delete();
    } catch (error: any) {
      if (error.code === 404) {
        // Already deleted, ignore
        return;
      }
      throw new DatabaseError('delete', error);
    }
  }

  async exists(cityId: string): Promise<boolean> {
    const tenant = await this.getById(cityId);
    return tenant !== null;
  }
}
