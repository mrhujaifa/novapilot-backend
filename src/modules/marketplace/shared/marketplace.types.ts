/**
 * SECURITY BOUNDARY — DO NOT VIOLATE
 *
 * Creator CONTROLS:
 * - API response (তার server থেকে আসে)
 * - API implementation (তার code)
 * - API availability (তার server up/down)
 * - API secret header (encrypted store)
 *
 * Creator CANNOT CONTROL:
 * - Consumer balance (Balance table, system only)
 * - Price used for billing (ApiPriceVersion, snapshot at request time)
 * - Ledger entries (immutable, system only)
 * - Reservation amount (atomic, system only)
 * - Settlement amount (Circle, system only)
 * - Usage status (MarketplaceUsageRecord, system only)
 * - Circle transaction (Circle API, system only)
 *
 * Any code that lets a Creator touch the above = security vulnerability.
 */
