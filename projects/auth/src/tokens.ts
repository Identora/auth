import { InjectionToken } from '@angular/core';

export interface AuthConfig {
  authority: string;
  realmId: string;
  clientId: string;
  redirectUrl: string;
  responseType: string;
  scope: string;
}

export const AUTH_CONFIG = new InjectionToken<AuthConfig>('AUTH_CONFIG');
