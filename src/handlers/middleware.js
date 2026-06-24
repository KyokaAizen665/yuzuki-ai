/**
 * middleware.js — re-export shim
 *
 * All permission and cooldown logic has moved to permissions.js.
 * This file is kept so any existing imports (`from './middleware.js'`) continue
 * to work without changes.
 */
export {
  isOwner,
  isPremium,
  checkPermission,
  checkPermissions,
  checkCooldown,
  setCooldown,
  getRemainingCooldown,
  clearCooldown,
} from './permissions.js';
