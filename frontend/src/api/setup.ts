import { apiClient } from './client';

export interface SetupStatusResponse {
  setupComplete: boolean;
}

export interface SetupResponse {
  message: string;
}

export function getSetupStatus(): Promise<SetupStatusResponse> {
  return apiClient.get<SetupStatusResponse>('/api/setup/status');
}

export function postSetup(data: {
  fullName: string;
  nickname: string;
  email: string;
  password: string;
}): Promise<SetupResponse> {
  return apiClient.post<SetupResponse>('/api/setup', data);
}
