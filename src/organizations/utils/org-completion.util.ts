export const ORG_SCALAR_FIELDS = [
  'name',
  'acronym',
  'phoneNumber',
  'publicEmail',
  'state',
  'lga',
  'address',
  'description',
  'logoUrl',
  'mission',
  'vision',
  'numberOfStaff',
  'numberOfVolunteers',
  'annualBudget',
] as const;

/**
 * Returns the organization profile completion as a whole-number percentage
 * (0–100). Counts the scalar fields above plus two array fields (sectors,
 * socials), each worth one point. Total weight = ORG_SCALAR_FIELDS.length + 2.
 */
export function calcOrgCompletion(org: any): number {
  const totalFields = ORG_SCALAR_FIELDS.length + 2; // +sectors +socials
  const filled =
    ORG_SCALAR_FIELDS.filter((k) => {
      const v = org[k];
      return v !== null && v !== undefined && v !== '';
    }).length +
    (Array.isArray(org.sectors) && org.sectors.length > 0 ? 1 : 0) +
    (Array.isArray(org.socials) && (org.socials as any[]).length > 0 ? 1 : 0);
  return Math.round((filled / totalFields) * 100);
}
