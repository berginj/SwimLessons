/**
 * Amilia API Client
 *
 * Wrapper for Amilia V3 REST API
 * Documentation: https://app.amilia.com/apidocs/
 *
 * Authentication: Bearer JWT token (expires after 1 year)
 * Rate Limits: Not specified (use respectful delays)
 */

import { getEnvRequired } from '@core/utils/env';

interface AmiliaAuthResponse {
  token: string;
  expiresAt: string;
}

interface AmiliaActivity {
  Id: number;
  Name: string;
  Description?: string;
  MinAge?: number;
  MaxAge?: number;
  Price?: number;
  Currency?: string;
  StartDate?: string;
  EndDate?: string;
  RegistrationUrl?: string;
  MaxCapacity?: number;
  CurrentEnrollment?: number;
  Location?: {
    Name?: string;
    Address?: string;
    City?: string;
    State?: string;
    ZipCode?: string;
  };
  Schedule?: {
    DaysOfWeek?: number[];
    StartTime?: string;
    EndTime?: string;
  };
}

interface AmiliaOrganization {
  Id: number;
  Name: string;
  Website?: string;
  Phone?: string;
  Email?: string;
}

/**
 * Amilia API Client
 */
export class AmiliaClient {
  private baseUrl = 'https://api.amilia.com/v3';
  private apiKey: string;
  private apiSecret: string;
  private jwtToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(apiKey?: string, apiSecret?: string) {
    this.apiKey = apiKey || getEnvRequired('AMILIA_API_KEY');
    this.apiSecret = apiSecret || getEnvRequired('AMILIA_API_SECRET');
  }

  /**
   * Authenticate and get JWT token
   * Token is valid for 1 year
   */
  async authenticate(): Promise<void> {
    // Check if we have a valid token
    if (this.jwtToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return; // Token still valid
    }

    const url = `${this.baseUrl}/auth/token`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: this.apiKey,
        apiSecret: this.apiSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Amilia authentication failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as AmiliaAuthResponse;

    this.jwtToken = data.token;
    this.tokenExpiry = new Date(data.expiresAt);

    console.log(`Amilia authenticated. Token expires: ${this.tokenExpiry.toISOString()}`);
  }

  /**
   * Get all activities (programs/classes)
   */
  async getActivities(filters?: {
    startDate?: string;
    endDate?: string;
    organizationId?: number;
  }): Promise<AmiliaActivity[]> {
    await this.ensureAuthenticated();

    const url = new URL(`${this.baseUrl}/activities`);

    if (filters?.startDate) {
      url.searchParams.set('startDate', filters.startDate);
    }
    if (filters?.endDate) {
      url.searchParams.set('endDate', filters.endDate);
    }
    if (filters?.organizationId) {
      url.searchParams.set('organizationId', filters.organizationId.toString());
    }

    const response = await this.makeRequest(url.toString());

    return response.data || [];
  }

  /**
   * Get organization details
   */
  async getOrganization(organizationId: number): Promise<AmiliaOrganization | null> {
    await this.ensureAuthenticated();

    const url = `${this.baseUrl}/organizations/${organizationId}`;
    const response = await this.makeRequest(url);

    return response.data || null;
  }

  /**
   * Get activity details by ID
   */
  async getActivity(activityId: number): Promise<AmiliaActivity | null> {
    await this.ensureAuthenticated();

    const url = `${this.baseUrl}/activities/${activityId}`;
    const response = await this.makeRequest(url);

    return response.data || null;
  }

  /**
   * Make authenticated API request
   */
  private async makeRequest(url: string, options: RequestInit = {}): Promise<any> {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.jwtToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401) {
      // Token expired, re-authenticate
      this.jwtToken = null;
      await this.authenticate();
      return this.makeRequest(url, options); // Retry
    }

    if (!response.ok) {
      throw new Error(`Amilia API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Ensure we have a valid authentication token
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.jwtToken || !this.tokenExpiry || this.tokenExpiry <= new Date()) {
      await this.authenticate();
    }
  }
}
