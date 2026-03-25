/**
 * Google Maps Transit Methods (Add to TransitService class)
 *
 * Copy these methods into src/services/transit/transit-service.ts
 * inside the TransitService class
 */

/**
 * Get transit estimate from Google Maps API
 * With automatic fallback and caching
 */
private async googleMapsEstimate(
  origin: Coordinates,
  destination: Coordinates,
  mode: TransitMode,
  departureTime?: string
): Promise<TransitEstimate | null> {
  if (!this.googleMapsService) {
    return null;
  }

  // Map our transit modes to Google's modes
  const googleMode = this.mapToGoogleMode(mode.mode);

  // Parse departure time
  const departureDatetime = departureTime ? new Date(departureTime) : new Date();

  try {
    const estimate = await this.googleMapsService.getTransitDirections(
      origin,
      destination,
      googleMode as any,
      departureDatetime
    );

    return estimate;
  } catch (error: any) {
    console.warn('Google Maps API failed, using fallback:', error.message);
    return null; // Will fall through to other methods
  }
}

/**
 * Map our transit modes to Google's mode types
 */
private mapToGoogleMode(mode: string): string {
  const modeMap: Record<string, string> = {
    'subway': 'transit',
    'bus': 'transit',
    'rail': 'transit',
    'walking': 'walking',
    'biking': 'bicycling',
    'driving': 'driving',
  };
  return modeMap[mode] || 'transit';
}
