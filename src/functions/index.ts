/**
 * Azure Functions Entry Point
 *
 * This file imports all function endpoints, which automatically registers them
 * with the Azure Functions runtime via the app.http() calls in each endpoint file.
 *
 * The @azure/functions app object uses side effects to register endpoints,
 * so importing these modules is sufficient to register them.
 */

// Import all function endpoints - this registers them automatically
import './search-api/search';
import './search-api/session-details';
import './search-api/cities';

console.log('[Functions] All endpoints registered');
