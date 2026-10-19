import { EMPTY_FILTERS } from '../features/explore/exploreTypes';

/**
 * The one place a "no filters" query is spelled out for the dev backend.
 *
 * It exists because the dev mock builds `ExploreQuery` objects directly, and
 * writing the eleven-field literal inline at each call site is how a field gets
 * forgotten. Referencing `EMPTY_FILTERS` means a new filter starts being applied
 * here the day it is added to the type.
 */
export const DEFAULT_FILTERS_FOR_QUERY = EMPTY_FILTERS;