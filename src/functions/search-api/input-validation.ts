/**
 * Input Validation for Search API
 * Prevents abuse, DoS attacks, and invalid data
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Comprehensive input validation for search requests
 * SECURITY: Prevents DoS, injection, and resource exhaustion
 */
export function validateSearchFilters(filters: any): ValidationResult {
  const errors: string[] = [];

  if (!filters || typeof filters !== 'object') {
    errors.push('filters must be an object');
    return { valid: false, errors };
  }

  // Validate childAge (prevent negative or absurd values)
  if (filters.childAge !== undefined) {
    if (typeof filters.childAge !== 'number') {
      errors.push('childAge must be a number');
    } else if (filters.childAge < 0 || filters.childAge > 300) {
      errors.push('childAge must be between 0 and 300 months (0-25 years)');
    }
  }

  // Validate daysOfWeek array (prevent massive arrays)
  if (filters.daysOfWeek !== undefined) {
    if (!Array.isArray(filters.daysOfWeek)) {
      errors.push('daysOfWeek must be an array');
    } else if (filters.daysOfWeek.length > 7) {
      errors.push('daysOfWeek cannot exceed 7 items');
    } else {
      // SECURITY: Validate each day is actually 0-6 (prevents injection)
      const invalidDays = filters.daysOfWeek.filter(
        (d: any) => typeof d !== 'number' || d < 0 || d > 6 || !Number.isInteger(d)
      );
      if (invalidDays.length > 0) {
        errors.push('daysOfWeek values must be integers 0-6 (Sunday-Saturday)');
      }
    }
  }

  // Validate geographyIds array (prevent DoS with 10,000 geographies)
  if (filters.geographyIds !== undefined) {
    if (!Array.isArray(filters.geographyIds)) {
      errors.push('geographyIds must be an array');
    } else if (filters.geographyIds.length > 50) {
      errors.push('geographyIds limited to 50 items (DoS prevention)');
    } else {
      // Validate each is a reasonable string
      const invalidGeos = filters.geographyIds.filter(
        (g: any) => typeof g !== 'string' || g.length > 100
      );
      if (invalidGeos.length > 0) {
        errors.push('geographyIds values must be strings under 100 characters');
      }
    }
  }

  // Validate maxTravelMinutes
  if (filters.maxTravelMinutes !== undefined) {
    if (typeof filters.maxTravelMinutes !== 'number') {
      errors.push('maxTravelMinutes must be a number');
    } else if (filters.maxTravelMinutes < 0 || filters.maxTravelMinutes > 300) {
      errors.push('maxTravelMinutes must be between 0 and 300 minutes (5 hours)');
    }
  }

  // Validate priceMax
  if (filters.priceMax !== undefined) {
    if (typeof filters.priceMax !== 'number') {
      errors.push('priceMax must be a number');
    } else if (filters.priceMax < 0 || filters.priceMax > 10000) {
      errors.push('priceMax must be between 0 and 10000 (prevent abuse)');
    }
  }

  // Validate timeWindow format (HH:MM)
  if (filters.timeWindow) {
    const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

    if (filters.timeWindow.earliest !== undefined) {
      if (typeof filters.timeWindow.earliest !== 'string') {
        errors.push('timeWindow.earliest must be a string');
      } else if (!timePattern.test(filters.timeWindow.earliest)) {
        errors.push('timeWindow.earliest must be in HH:MM format (00:00-23:59)');
      }
    }

    if (filters.timeWindow.latest !== undefined) {
      if (typeof filters.timeWindow.latest !== 'string') {
        errors.push('timeWindow.latest must be a string');
      } else if (!timePattern.test(filters.timeWindow.latest)) {
        errors.push('timeWindow.latest must be in HH:MM format (00:00-23:59)');
      }
    }
  }

  // Validate startDate/endDate format (ISO dates)
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (filters.startDateMin !== undefined) {
    if (typeof filters.startDateMin !== 'string') {
      errors.push('startDateMin must be a string');
    } else if (!datePattern.test(filters.startDateMin)) {
      errors.push('startDateMin must be in YYYY-MM-DD format');
    }
  }

  if (filters.startDateMax !== undefined) {
    if (typeof filters.startDateMax !== 'string') {
      errors.push('startDateMax must be a string');
    } else if (!datePattern.test(filters.startDateMax)) {
      errors.push('startDateMax must be in YYYY-MM-DD format');
    }
  }

  // Validate skillLevel array
  if (filters.skillLevel !== undefined) {
    if (!Array.isArray(filters.skillLevel)) {
      errors.push('skillLevel must be an array');
    } else if (filters.skillLevel.length > 10) {
      errors.push('skillLevel limited to 10 items');
    } else {
      const validSkills = ['beginner', 'intermediate', 'advanced', 'all'];
      const invalidSkills = filters.skillLevel.filter((s: any) => !validSkills.includes(s));
      if (invalidSkills.length > 0) {
        errors.push(`skillLevel values must be one of: ${validSkills.join(', ')}`);
      }
    }
  }

  // Validate facilityType array
  if (filters.facilityType !== undefined) {
    if (!Array.isArray(filters.facilityType)) {
      errors.push('facilityType must be an array');
    } else {
      const validTypes = ['outdoor', 'indoor', 'both'];
      const invalidTypes = filters.facilityType.filter((t: any) => !validTypes.includes(t));
      if (invalidTypes.length > 0) {
        errors.push(`facilityType values must be one of: ${validTypes.join(', ')}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate pagination parameters
 * SECURITY: Prevent resource exhaustion
 */
export function validatePagination(pagination: any): ValidationResult {
  const errors: string[] = [];

  if (!pagination) {
    return { valid: true, errors }; // Pagination is optional
  }

  if (typeof pagination !== 'object') {
    errors.push('pagination must be an object');
    return { valid: false, errors };
  }

  // Validate skip
  if (pagination.skip !== undefined) {
    if (typeof pagination.skip !== 'number') {
      errors.push('pagination.skip must be a number');
    } else if (pagination.skip < 0) {
      errors.push('pagination.skip must be non-negative');
    } else if (pagination.skip > 10000) {
      errors.push('pagination.skip limited to 10000 (deep pagination not supported)');
    }
  }

  // Validate take (CRITICAL: Limit result set size)
  if (pagination.take !== undefined) {
    if (typeof pagination.take !== 'number') {
      errors.push('pagination.take must be a number');
    } else if (pagination.take < 1) {
      errors.push('pagination.take must be at least 1');
    } else if (pagination.take > 100) {
      errors.push('pagination.take limited to 100 results per page (prevent resource abuse)');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate cityId
 * SECURITY: Prevent injection and ensure reasonable length
 */
export function validateCityId(cityId: any): ValidationResult {
  const errors: string[] = [];

  if (!cityId || typeof cityId !== 'string') {
    errors.push('cityId is required and must be a string');
    return { valid: false, errors };
  }

  if (cityId.length > 50) {
    errors.push('cityId must not exceed 50 characters');
  }

  // Only allow lowercase letters, numbers, and hyphens
  if (!/^[a-z0-9-]+$/.test(cityId)) {
    errors.push('cityId must contain only lowercase letters, numbers, and hyphens');
  }

  return { valid: errors.length === 0, errors };
}
