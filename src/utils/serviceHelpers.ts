/**
 * Formats service names for user-facing views.
 * For Parent role users (or Parent role administrative views), maps:
 * - AMPO / LPO-to-Site / Australia Post-to-Site -> "Post Office-to-IM"
 * - H2H -> "IM-to-Site"
 * - H2H 2 / H2H2 -> "Site-to-IM"
 * 
 * For Non-Parent roles (e.g. Customer), returns the original service string.
 */
export const getDisplayServiceName = (service: string, isParentRole: boolean = false): string => {
  if (!service) return '';
  if (isParentRole) {
    const norm = service.trim().toLowerCase();
    if (norm === 'h2h 2' || norm === 'h2h2' || norm === 'site-to-im') {
      return 'Site-to-IM';
    }
    if (norm === 'h2h' || norm === 'im-to-site') {
      return 'IM-to-Site';
    }
    if (norm === 'ampo' || norm.includes('ampo') || norm === 'lpo-to-site' || norm === 'australia post-to-site') {
      return 'Post Office-to-IM';
    }
    if (norm === 'pmpo' || norm === 'site-to-lpo' || norm === 'site-to-australia post') {
      return 'Outgoing Mail Lodgement';
    }
  }
  return service;
};
