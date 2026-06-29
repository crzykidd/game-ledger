import { canActOn } from './tier-rule';
import { Role } from '@game-ledger/contract';

describe('canActOn (tier-rule helper)', () => {
  it('SUPER_ADMIN can act on ADMIN', () => {
    expect(canActOn(Role.SUPER_ADMIN, Role.ADMIN)).toBe(true);
  });

  it('SUPER_ADMIN can act on MANAGER', () => {
    expect(canActOn(Role.SUPER_ADMIN, Role.MANAGER)).toBe(true);
  });

  it('SUPER_ADMIN can act on PLAYER', () => {
    expect(canActOn(Role.SUPER_ADMIN, Role.PLAYER)).toBe(true);
  });

  it('SUPER_ADMIN cannot act on SUPER_ADMIN', () => {
    expect(canActOn(Role.SUPER_ADMIN, Role.SUPER_ADMIN)).toBe(false);
  });

  it('ADMIN can act on MANAGER', () => {
    expect(canActOn(Role.ADMIN, Role.MANAGER)).toBe(true);
  });

  it('ADMIN can act on PLAYER', () => {
    expect(canActOn(Role.ADMIN, Role.PLAYER)).toBe(true);
  });

  it('ADMIN cannot act on ADMIN', () => {
    expect(canActOn(Role.ADMIN, Role.ADMIN)).toBe(false);
  });

  it('ADMIN cannot act on SUPER_ADMIN', () => {
    expect(canActOn(Role.ADMIN, Role.SUPER_ADMIN)).toBe(false);
  });

  it('MANAGER can act on PLAYER', () => {
    expect(canActOn(Role.MANAGER, Role.PLAYER)).toBe(true);
  });

  it('MANAGER cannot act on ADMIN', () => {
    expect(canActOn(Role.MANAGER, Role.ADMIN)).toBe(false);
  });

  it('MANAGER cannot act on MANAGER', () => {
    expect(canActOn(Role.MANAGER, Role.MANAGER)).toBe(false);
  });

  it('PLAYER cannot act on anyone', () => {
    expect(canActOn(Role.PLAYER, Role.PLAYER)).toBe(false);
    expect(canActOn(Role.PLAYER, Role.MANAGER)).toBe(false);
    expect(canActOn(Role.PLAYER, Role.ADMIN)).toBe(false);
    expect(canActOn(Role.PLAYER, Role.SUPER_ADMIN)).toBe(false);
  });
});
