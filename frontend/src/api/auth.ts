import { Permission, Role, ThemePref, UserState } from '@game-ledger/contract';
import { apiClient } from './client';

export interface MeResponse {
  id: string;
  email: string;
  nickname: string;
  fullName: string;
  role: Role;
  state: UserState;
  themePref: ThemePref;
  effectivePermissions: Permission[];
}

export interface LoginResponse {
  message: string;
}

export interface LogoutResponse {
  message: string;
}

export type PatchMeResponse = MeResponse;

export function getMe(): Promise<MeResponse> {
  return apiClient.get<MeResponse>('/api/auth/me');
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>('/api/auth/login', { email, password });
}

export function logout(): Promise<LogoutResponse> {
  return apiClient.post<LogoutResponse>('/api/auth/logout');
}

export function patchMe(themePref: ThemePref): Promise<PatchMeResponse> {
  return apiClient.patch<PatchMeResponse>('/api/auth/me', { themePref });
}
