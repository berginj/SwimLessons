import { Coordinates, DataConfidenceLevel } from './city-config';

/**
 * Slow-changing facility reference data used to crosswalk messy lesson/session feeds
 * back to stable physical pools/facilities.
 */
export interface FacilityReferenceDataset {
  schemaVersion: '2026-04-02';
  cityId: string;
  sourceSnapshot: FacilitySourceSnapshot;
  facilities: FacilityReferenceRecord[];
}

export interface FacilitySourceSnapshot {
  sourceSystem: string;
  sourceFormat: 'tableau-twbx' | 'tableau-hyper' | 'csv';
  workbookName?: string;
  relationName?: string;
  extractedTable?: string;
  rowCount: number;
  uniqueFacilityCount: number;
  sourceColumns: string[];
}

export interface FacilityReferenceRecord {
  canonicalFacilityId: string;
  cityId: string;
  locationId: string;

  // Stable source identity
  sourceSystem: string;
  sourceFacilityId: string;
  sourceRecordType?: string;

  // Human-readable identity
  officialName: string;
  displayName: string;
  normalizedName: string;
  alternateNames: string[];
  operatorName?: string;

  // Geography + location
  address: FacilityReferenceAddress;
  geography: FacilityReferenceGeography;
  coordinates?: Coordinates;
  coordinateSource?: string;
  coordinateConfidence: DataConfidenceLevel | 'none';

  // Facility classification
  facilityType: FacilityReferenceType;
  sourceAttributes: FacilitySourceAttributes;

  // Latest observed inspection summary when the source includes inspection rows
  inspection?: FacilityInspectionSummary;

  // Deterministic keys for downstream crosswalk/matching
  crosswalk: FacilityCrosswalk;
}

export interface FacilityReferenceAddress {
  street1: string;
  normalizedStreet1: string;
  city: string;
  state: string;
  postalCode?: string;
}

export interface FacilityReferenceGeography {
  boroughCode?: string;
  boroughName?: string;
  geographyId?: string;
  neighborhoodName?: string;
  neighborhoodCode?: string;
  communityBoard?: string;
  councilDistrict?: string;
  censusTract?: string;
  boroBlockLot?: string;
  bin?: string;
}

export interface FacilitySourceAttributes {
  facilityGrouping?: string;
  highLevelCategory?: string;
  category?: string;
  organizationNameType?: string;
  observationCount: number;
}

export interface FacilityInspectionSummary {
  latestInspectionDate?: string;
  latestInspectionType?: string;
  observedInspectionTypes: string[];
  latestViolationCounts?: FacilityViolationCounts;
}

export interface FacilityViolationCounts {
  all?: number;
  phh?: number;
  critical?: number;
  general?: number;
}

export interface FacilityCrosswalk {
  normalizedNames: string[];
  normalizedAddressVariants: string[];
  stableIds: FacilityStableId[];
  preferredKeys: string[];
}

export interface FacilityStableId {
  idType: 'source_facility_id' | 'location_id' | 'bin' | 'boro_block_lot';
  value: string;
}

export type FacilityReferenceType = 'indoor' | 'outdoor' | 'both' | 'unknown';
