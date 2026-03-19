export const PERMISSIONS = {
  // User Management
  USER_READ: 'user:read',
  USER_APPROVE: 'user:approve',
  USER_SUSPEND: 'user:suspend',
  USER_DELETE: 'user:delete',
  USER_EXPORT: 'user:export',

  // Admin / Team Management
  ADMIN_CREATE: 'admin:create',
  ADMIN_MANAGE: 'admin:manage',

  // Organization Management
  ORG_READ: 'org:read',
  ORG_UPDATE: 'org:update',
  ORG_DELETE: 'org:delete',
  ORG_SPOTLIGHT: 'org:spotlight',

  // Expert Management
  EXPERT_READ: 'expert:read',
  EXPERT_MODERATE: 'expert:moderate',
  EXPERT_VERIFY: 'expert:verify',

  // Content (Blog / News / Spotlight)
  CONTENT_READ: 'content:read',
  CONTENT_WRITE: 'content:write',
  CONTENT_DELETE: 'content:delete',
  SPOTLIGHT_MANAGE: 'spotlight:manage',

  // Events & Webinars
  EVENT_READ: 'event:read',
  EVENT_WRITE: 'event:write',
  EVENT_DELETE: 'event:delete',
  EVENT_MANAGE_ATTENDEES: 'event:manage_attendees',

  // Resource Library
  RESOURCE_READ: 'resource:read',
  RESOURCE_UPLOAD: 'resource:upload',
  RESOURCE_DELETE: 'resource:delete',
  TAXONOMY_MANAGE: 'taxonomy:manage', // Categories, tags, badge catalogue
  BADGE_MANAGE: 'badge:manage', // Create / delete badges in the catalogue

  // Community / Forums
  FORUM_READ: 'forum:read',
  FORUM_WRITE: 'forum:write',
  FORUM_MODERATE: 'forum:moderate',

  // ODA Assessment
  ODA_READ: 'oda:read',
  ODA_SUBMIT: 'oda:submit',
  ODA_REVIEW: 'oda:review',
  ODA_MANAGE: 'oda:manage', // pillar / block / question CRUD

  // Directory
  DIRECTORY_VIEW_CONTACTS: 'directory:view_contacts',

  // Audit Logs
  AUDIT_READ: 'audit:read',

  // Mentor REquest
  MENTOR_REQUEST_READ: 'mentor:read',
  MENTOR_REQUEST_WRITE: 'mentor:write',
  MENTOR_REQUEST_MANAGE: 'mentor:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Default permission set granted to each role at login.
 *
 * Rules:
 *  - SUPER_ADMIN gets every permission automatically.
 *  - Admin roles (CONTENT_ADMIN, EVENT_ADMIN, RESOURCE_ADMIN) get a scoped
 *    set relevant to their domain plus cross-cutting read access.
 *  - Member roles (NGO_MEMBER, EXPERT) get permissions for self-service
 *    actions only. Owner-scoped routes (update own org, update own expert
 *    profile) are guarded by JwtAuthGuard + RolesGuard alone — no
 *    fine-grained permission key is required for those.
 *  - GUEST gets read-only access to public content.
 *
 * Fine-grained overrides are stored per admin in the AdminPermission table.
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: Object.values(PERMISSIONS) as Permission[],

  CONTENT_ADMIN: [
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.CONTENT_WRITE,
    PERMISSIONS.CONTENT_DELETE,
    PERMISSIONS.SPOTLIGHT_MANAGE,
    PERMISSIONS.ODA_MANAGE,
    // Cross-cutting read access
    PERMISSIONS.USER_READ,
    PERMISSIONS.ORG_READ,
    PERMISSIONS.EXPERT_READ,
    PERMISSIONS.RESOURCE_READ,
    PERMISSIONS.EVENT_READ,
    PERMISSIONS.FORUM_READ,
  ],

  EVENT_ADMIN: [
    PERMISSIONS.EVENT_READ,
    PERMISSIONS.EVENT_WRITE,
    PERMISSIONS.EVENT_DELETE,
    PERMISSIONS.EVENT_MANAGE_ATTENDEES,
    // Cross-cutting read access
    PERMISSIONS.USER_READ,
    PERMISSIONS.ORG_READ,
    PERMISSIONS.EXPERT_READ,
  ],

  RESOURCE_ADMIN: [
    PERMISSIONS.RESOURCE_READ,
    PERMISSIONS.RESOURCE_UPLOAD,
    PERMISSIONS.RESOURCE_DELETE,
    PERMISSIONS.TAXONOMY_MANAGE,
    PERMISSIONS.BADGE_MANAGE,
    // Cross-cutting read access
    PERMISSIONS.USER_READ,
    PERMISSIONS.ORG_READ,
    PERMISSIONS.EXPERT_READ,
  ],

  // NGO_MEMBER: self-service actions only.
  NGO_MEMBER: [
    PERMISSIONS.ORG_READ,
    PERMISSIONS.EVENT_WRITE,
    PERMISSIONS.EVENT_READ,
    PERMISSIONS.EVENT_WRITE,
    PERMISSIONS.EVENT_DELETE,
    PERMISSIONS.EVENT_MANAGE_ATTENDEES,
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.RESOURCE_READ,
    PERMISSIONS.FORUM_READ,
    PERMISSIONS.FORUM_WRITE,
    PERMISSIONS.ODA_READ,
    PERMISSIONS.ODA_SUBMIT,
    PERMISSIONS.EVENT_READ,
    PERMISSIONS.DIRECTORY_VIEW_CONTACTS,
    PERMISSIONS.EXPERT_READ,
    PERMISSIONS.MENTOR_REQUEST_READ,
    PERMISSIONS.MENTOR_REQUEST_WRITE,
  ],

  // EXPERT: same as NGO_MEMBER minus ODA (which is NGO-specific).
  // Owner-scoped expert profile routes are gated by RolesGuard(EXPERT).
  EXPERT: [
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.RESOURCE_READ,
    PERMISSIONS.FORUM_READ,
    PERMISSIONS.FORUM_WRITE,
    PERMISSIONS.EVENT_READ,
    PERMISSIONS.EVENT_WRITE,
    PERMISSIONS.EVENT_READ,
    PERMISSIONS.EVENT_WRITE,
    PERMISSIONS.EVENT_DELETE,
    PERMISSIONS.EVENT_MANAGE_ATTENDEES,
    PERMISSIONS.DIRECTORY_VIEW_CONTACTS,
    PERMISSIONS.ORG_READ,
    PERMISSIONS.EXPERT_READ,
    PERMISSIONS.MENTOR_REQUEST_READ,
    PERMISSIONS.MENTOR_REQUEST_MANAGE,
  ],

  GUEST: [
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.RESOURCE_READ,
    PERMISSIONS.FORUM_READ,
    PERMISSIONS.EVENT_READ,
    PERMISSIONS.MENTOR_REQUEST_READ,
    PERMISSIONS.MENTOR_REQUEST_WRITE,
  ],
};
