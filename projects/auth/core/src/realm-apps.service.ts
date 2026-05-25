import { Injectable, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AUTH_CONFIG, AuthConfig } from '@identora/auth';

export interface AppDef {
  id: string;
  name: string;
  app_url: string;
}

@Injectable({ providedIn: 'root' })
export class RealmAppsService {

  private baseUrl: string;

  constructor(
    private http: HttpClient,
    @Inject(AUTH_CONFIG) config: AuthConfig
  ) {
    this.baseUrl = `${config.authority}/api/realms/${config.realmId}/applications`;
  }

  async getApplications(token?: string | null): Promise<AppDef[]> {
    try {
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await firstValueFrom(
        this.http.get<{ applications: AppDef[] }>(this.baseUrl, { withCredentials: true, headers })
      );
      return res.applications ?? [];
    } catch {
      return [];
    }
  }

}
