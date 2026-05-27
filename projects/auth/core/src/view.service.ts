import { Injectable, Inject } from '@angular/core';
import { BehaviorSubject, firstValueFrom, Observable } from 'rxjs';
import { LocationStrategy } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AUTH_CONFIG, AuthConfig } from '@cl4im/angular';

export type Route = {
  route_display_name?: string;
  route_icon?: string;
  route_id?: string;
  route_name?: string;
  route_order?: number;
  route_path?: string;
  route_redirect?: string;
  route_redirect_to?: string;
  route_type?: string;
  routed_id: string;
  routes?: Route[];
};

export type View = { routes?: Route[] };

interface Url { label: string; routerLink: string }
export interface BreadCrumb { icon: string; urls: Url[] }

@Injectable({ providedIn: 'root' })
export class ViewService {

  private baseUrl: string;

  private _currentView = new BehaviorSubject<View>(null as unknown as View);
  public currentView$: Observable<View> = this._currentView.asObservable();
  public get currentView(): View { return this._currentView.value; }

  private _breadCrumb = new BehaviorSubject<BreadCrumb>(null as unknown as BreadCrumb);
  public breadCrumb$: Observable<BreadCrumb> = this._breadCrumb.asObservable();
  public get breadCrumb(): BreadCrumb { return this._breadCrumb.value; }

  private _logControl = new BehaviorSubject<Route[]>(null as unknown as Route[]);
  public logControl$: Observable<Route[]> = this._logControl.asObservable();
  public get logControl(): Route[] { return this._logControl.value; }

  constructor(
    private http: HttpClient,
    private locationStrategy: LocationStrategy,
    @Inject(AUTH_CONFIG) config: AuthConfig
  ) {
    this.baseUrl = `${config.authority}/api/realms/${config.realmId}/protocol/openid-connect`;
  }

  async update(token?: string | null): Promise<any> {
    const views = await this.view(token);
    this._currentView.next(views ?? []);
    return views;
  }

  async view(token?: string | null): Promise<any> {
    try {
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      return await firstValueFrom(
        this.http.get<any>(`${this.baseUrl}/view`, { withCredentials: true, headers })
      );
    } catch {
      return [];
    }
  }

  async clearView(): Promise<void> { this._currentView.next(null as unknown as View); }

  getLevelControl(url: string, type: string): number {
    return url.replace(this.locationStrategy.getBaseHref(), '/').split('/').length - (type === 'activate' ? 1 : 0);
  }

  getLevel(url: string): number {
    return url.replace(this.locationStrategy.getBaseHref(), '/').split('/').length - 1;
  }

  getUrlAtLevel(url: string, level: number): string {
    return url.replace(this.locationStrategy.getBaseHref(), '/').split('/').slice(0, level + 1).join('/');
  }

  updateBreadcrumb(route: any[]): void {
    const logControl: { urls: any[]; icon: string | null } = { urls: [], icon: null };
    const breadcrumbs: { icon: string | null; urls: { label: string; routerLink: string }[] } = { icon: null, urls: [] };

    for (let level = 1; level < route.length; level++) {
      logControl.urls.push(route[level]);
      logControl.icon = route[level].route_icon;
      breadcrumbs.icon = route[level].route_icon;
      breadcrumbs.urls.push({
        label: route[level].route_display_name,
        routerLink: route[level].route_redirect,
      });
    }

    this._logControl.next(logControl.urls);
    this._breadCrumb.next(breadcrumbs as BreadCrumb);
  }
}
