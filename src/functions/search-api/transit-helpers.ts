import { Coordinates, TransitMode } from '@core/contracts/city-config';
import { ITransitService } from '@core/contracts/services';
import { Session, TransitEstimate } from '@core/models/canonical-schema';

export const DEFAULT_TRANSIT_ORIGIN_LABEL = 'Times Square';

const NYC_CANDIDATE_MODES: TransitMode[] = [
  { mode: 'walking', displayName: 'Walking', maxReasonableMinutes: 90 },
  { mode: 'subway', displayName: 'Transit', maxReasonableMinutes: 90 },
];

const DEFAULT_CANDIDATE_MODES: TransitMode[] = [
  { mode: 'walking', displayName: 'Walking', maxReasonableMinutes: 90 },
];

export function getRoutingOrigin(
  requestedOrigin: Coordinates | undefined,
  defaultCenter: Coordinates
): Coordinates {
  return requestedOrigin ?? defaultCenter;
}

export function getSessionDepartureTime(session: Session): string {
  const startTime = session.timeOfDay?.start || '12:00';
  const normalizedTime = startTime.length === 5 ? `${startTime}:00` : startTime;
  return `${session.startDate}T${normalizedTime}`;
}

export async function estimatePreferredTransitTime(
  transitService: ITransitService,
  cityId: string,
  origin: Coordinates,
  destination: Coordinates,
  departureTime?: string
): Promise<TransitEstimate | null> {
  const candidateModes = cityId === 'nyc' ? NYC_CANDIDATE_MODES : DEFAULT_CANDIDATE_MODES;
  const estimates = await Promise.all(
    candidateModes.map((mode) =>
      transitService.estimateTransitTime(origin, destination, mode, cityId, departureTime)
    )
  );

  let bestEstimate: TransitEstimate | null = null;

  for (const estimate of estimates) {
    if (!estimate) {
      continue;
    }

    if (!bestEstimate || estimate.durationMinutes < bestEstimate.durationMinutes) {
      bestEstimate = estimate;
    }
  }

  return bestEstimate;
}

export function formatLocationAddress(address?: {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}): string {
  if (!address) {
    return 'Address unavailable';
  }

  return [address.street, address.city, address.state, address.zipCode]
    .filter(Boolean)
    .join(', ');
}
