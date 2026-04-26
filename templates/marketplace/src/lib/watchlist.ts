export function toggleWatchedListingId(
  watchedListingIds: string[],
  listingId: string
): string[] {
  return watchedListingIds.includes(listingId)
    ? watchedListingIds.filter((entry) => entry !== listingId)
    : [listingId, ...watchedListingIds];
}

export function recordRecentlyViewedListingId(
  recentlyViewedListingIds: string[],
  listingId: string,
  limit = 8
): string[] {
  return [
    listingId,
    ...recentlyViewedListingIds.filter((entry) => entry !== listingId),
  ].slice(0, limit);
}

export function toggleCompareListingId(
  compareListingIds: string[],
  listingId: string,
  limit = 3
): string[] {
  if (compareListingIds.includes(listingId)) {
    return compareListingIds.filter((entry) => entry !== listingId);
  }
  return [listingId, ...compareListingIds].slice(0, limit);
}
