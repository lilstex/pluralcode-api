/**
 * PLRCAP Permission Keys
 * Each string is a discrete capability that can be checked with the @Permissions() decorator.
 */
export const PERMISSIONS = {
  // ── User Management ──────────────────────────────
  USER_READ: 'user:read',
  USER_APPROVE: 'user:approve',
  USER_SUSPEND: 'user:suspend',
  USER_DELETE: 'user:delete',
  USER_EXPORT: 'user:export',

  // ── Admin / Team Management ───────────────────────
  ADMIN_CREATE: 'admin:create',
  ADMIN_MANAGE: 'admin:manage',

  // ── Organization Management ───────────────────────
  ORG_CREATE: 'org:create',
  ORG_READ: 'org:read',
  ORG_UPDATE: 'org:update',
  ORG_DELETE: 'org:delete',
  ORG_ASSIGN_USER: 'org:assign_user',
  ORG_REMOVE_USER: 'org:remove_user',

  // ── Content (Blog / News / Spotlight) ─────────────
  CONTENT_READ: 'content:read',
  CONTENT_WRITE: 'content:write',
  CONTENT_DELETE: 'content:delete',
  SPOTLIGHT_MANAGE: 'spotlight:manage',

  // ── Events & Webinars ─────────────────────────────
  EVENT_READ: 'event:read',
  EVENT_WRITE: 'event:write',
  EVENT_DELETE: 'event:delete',
  EVENT_MANAGE_ATTENDEES: 'event:manage_attendees',

  // ── Resource Library ──────────────────────────────
  RESOURCE_READ: 'resource:read',
  RESOURCE_UPLOAD: 'resource:upload',
  RESOURCE_DELETE: 'resource:delete',
  TAXONOMY_MANAGE: 'taxonomy:manage',

  // ── Community / Forums ────────────────────────────
  FORUM_READ: 'forum:read',
  FORUM_WRITE: 'forum:write',
  FORUM_MODERATE: 'forum:moderate',

  // ── ODA Assessment ────────────────────────────────
  ODA_SUBMIT: 'oda:submit',
  ODA_REVIEW: 'oda:review',

  // ── Directory ─────────────────────────────────────
  DIRECTORY_VIEW_CONTACTS: 'directory:view_contacts',

  // ── Audit Logs ────────────────────────────────────
  AUDIT_READ: 'audit:read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Default permission set granted to each role at login.
 * Fine-grained overrides are stored per admin in the DB (AdminPermission model).
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: Object.values(PERMISSIONS) as Permission[], // All permissions

  CONTENT_ADMIN: [
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.CONTENT_WRITE,
    PERMISSIONS.CONTENT_DELETE,
    PERMISSIONS.SPOTLIGHT_MANAGE,
    PERMISSIONS.ORG_READ,
  ],

  EVENT_ADMIN: [
    PERMISSIONS.EVENT_READ,
    PERMISSIONS.EVENT_WRITE,
    PERMISSIONS.EVENT_DELETE,
    PERMISSIONS.EVENT_MANAGE_ATTENDEES,
    PERMISSIONS.ORG_READ,
  ],

  RESOURCE_ADMIN: [
    PERMISSIONS.RESOURCE_READ,
    PERMISSIONS.RESOURCE_UPLOAD,
    PERMISSIONS.RESOURCE_DELETE,
    PERMISSIONS.TAXONOMY_MANAGE,
    PERMISSIONS.ORG_READ,
  ],

  NGO_MEMBER: [
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.RESOURCE_READ,
    PERMISSIONS.FORUM_READ,
    PERMISSIONS.FORUM_WRITE,
    PERMISSIONS.ODA_SUBMIT,
    PERMISSIONS.DIRECTORY_VIEW_CONTACTS,
    PERMISSIONS.ORG_READ,
  ],

  EXPERT: [
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.RESOURCE_READ,
    PERMISSIONS.FORUM_READ,
    PERMISSIONS.FORUM_WRITE,
    PERMISSIONS.DIRECTORY_VIEW_CONTACTS,
    PERMISSIONS.ORG_READ,
  ],

  GUEST: [
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.RESOURCE_READ,
    PERMISSIONS.FORUM_READ,
    PERMISSIONS.EVENT_READ,
  ],
};
