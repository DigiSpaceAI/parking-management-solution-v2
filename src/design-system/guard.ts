/**
 * The write-guard seam for design-system components (002 tech design: "Button
 * takes a guard prop that applies the 001 write guard"). Since R1b (002 on top
 * of 001) this is 001's useWriteGuard: disabled with "Select one site to make
 * changes" in All sites mode and read-only while viewing as another user.
 */
export { useWriteGuard as useGuard } from '../utils/withSite';
export type { WriteGuardProps as GuardProps } from '../utils/withSite';
export type GuardFn = ReturnType<typeof import('../utils/withSite').useWriteGuard>;
