import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, Inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, distinctUntilChanged, firstValueFrom, Observable } from 'rxjs';

import { generatePkcePair, decodeJwt } from '@cl4im/angular/util';
import { AUTH_CONFIG, AuthConfig } from '@cl4im/angular';
import { ViewService } from './view.service';

type ChannelMessage =
  | { type: 'TOKEN_UPDATED'; accessToken: string }
  | { type: 'REFRESH_STARTED' }
  | { type: 'REFRESH_FAILED' }
  | { type: 'LOGOUT' };

@Injectable({ providedIn: 'root' })
export class AuthorizationService {

  private url: string;
  private clientId: string;
  private redirectUrl: string;
  private scope: string;

  private accessToken: string | null = null;
  private renewTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshPromise: Promise<void> | null = null;
  private expiryLogInterval: ReturnType<typeof setInterval> | null = null;

  private channel: BroadcastChannel;

  private isAuth = new BehaviorSubject<boolean>(false);
  public isAuth$: Observable<boolean> = this.isAuth.asObservable().pipe(distinctUntilChanged());
  get authenticated(): boolean { return this.isAuth.value; }

  constructor(
    private router: Router,
    private http: HttpClient,
    private view: ViewService,
    @Inject(AUTH_CONFIG) config: AuthConfig
  ) {
    this.url = `${config.authority}/api/realms/${config.realmId}/protocol/openid-connect`;
    this.clientId = config.clientId;
    this.redirectUrl = config.redirectUrl;
    this.scope = config.scope;

    this.channel = new BroadcastChannel(`auth_${this.clientId}`);

    this.channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const msg = event.data;

      if (msg.type === 'TOKEN_UPDATED') {
        this.applyToken(msg.accessToken);
      } else if (msg.type === 'LOGOUT') {
        this.accessToken = null;
        this.isAuth.next(false);
        this.clearRenewTimer();
        this.router.navigate(['/logoff'], { queryParams: { loggedOut: 'true' } });
      } else if (msg.type === 'REFRESH_STARTED' && !this.refreshPromise) {
        this.refreshPromise = new Promise<void>((resolve, reject) => {
          const handler = (e: MessageEvent<ChannelMessage>) => {
            if (e.data.type === 'TOKEN_UPDATED') {
              this.channel.removeEventListener('message', handler as EventListener);
              resolve();
            } else if (e.data.type === 'REFRESH_FAILED' || e.data.type === 'LOGOUT') {
              this.channel.removeEventListener('message', handler as EventListener);
              reject(new Error(e.data.type));
            }
          };
          this.channel.addEventListener('message', handler as EventListener);
          setTimeout(() => {
            this.channel.removeEventListener('message', handler as EventListener);
            reject(new Error('cross_tab_timeout'));
          }, 15_000);
        }).finally(() => { this.refreshPromise = null; });
      }
    };
  }

  getToken(): string | null {
    return this.accessToken;
  }

  private applyToken(token: string): void {
    this.accessToken = token;
    this.isAuth.next(true);
    this.scheduleRenew(token);
    this.startExpiryLog(token);
  }

  private startExpiryLog(token: string): void {
    if (this.expiryLogInterval) clearInterval(this.expiryLogInterval);
    this.expiryLogInterval = setInterval(() => {
      const payload = decodeJwt(token);
      if (!payload?.exp) return;
      const remainingMs = payload.exp * 1000 - Date.now();
      const remainingSec = Math.round(remainingMs / 1000);
      console.log(`[cl4im-angular] token expira em ${remainingSec}s (${new Date(payload.exp * 1000).toLocaleTimeString()})`);
    }, 10_000);
  }

  private scheduleRenew(token: string): void {
    this.clearRenewTimer();
    const payload = decodeJwt(token);
    if (!payload?.exp) return;
    const jitter = Math.random() * 5_000;
    const delay = Math.max(0, payload.exp * 1000 - Date.now() - 60_000 + jitter);
    this.renewTimer = setTimeout(() => this.silentRenew(), delay);
  }

  private clearRenewTimer(): void {
    if (this.renewTimer !== null) {
      clearTimeout(this.renewTimer);
      this.renewTimer = null;
    }
  }

  async initialize(): Promise<void> {
    if (window !== window.parent) return;
    try {
      await this.silentRenew();
      await this.view.update(this.accessToken);
    } catch {
      this.isAuth.next(false);
    }
  }

  async authorize(): Promise<void> {
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const { verifier, challenge } = await generatePkcePair();

    sessionStorage.setItem('pkce_code_verifier', verifier);
    sessionStorage.setItem('oidc_state', state);
    sessionStorage.setItem('oidc_nonce', nonce);

    const url = new URL(`${this.url}/authorize`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUrl);
    url.searchParams.set('scope', this.scope);
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');

    window.location.href = url.toString();
  }

  async token(params: Record<string, string>, redirect = true): Promise<void> {
    let body = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      body = body.set(key, value);
    }
    const { access_token, id_token } = await firstValueFrom(
      this.http.post<any>(`${this.url}/token`, body, { withCredentials: true })
    );

    if (id_token) {
      const storedNonce = sessionStorage.getItem('oidc_nonce');
      if (storedNonce) {
        const payload = JSON.parse(atob(id_token.split('.')[1]));
        if (payload.nonce !== storedNonce) {
          this.isAuth.next(false);
          return;
        }
      }
    }

    sessionStorage.removeItem('oidc_state');
    sessionStorage.removeItem('pkce_code_verifier');
    sessionStorage.removeItem('oidc_nonce');

    this.applyToken(access_token);
    this.channel.postMessage({ type: 'TOKEN_UPDATED', accessToken: access_token } as ChannelMessage);

    if (redirect) {
      const views = await this.view.update(access_token);
      const firstRoute = views?.routes?.[0]?.route_redirect ?? '/home';
      this.router.navigate([firstRoute]);
    }
  }

  async silentRenew(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;

    this.channel.postMessage({ type: 'REFRESH_STARTED' } as ChannelMessage);

    this.refreshPromise = this.doSilentRenew()
      .then(token => {
        this.channel.postMessage({ type: 'TOKEN_UPDATED', accessToken: token } as ChannelMessage);
      })
      .catch(err => {
        this.channel.postMessage({ type: 'REFRESH_FAILED' } as ChannelMessage);
        throw err;
      })
      .finally(() => { this.refreshPromise = null; });

    return this.refreshPromise;
  }

  private doSilentRenew(): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const { verifier, challenge } = await generatePkcePair();
      const silentState = crypto.randomUUID();

      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'display:none;width:0;height:0;border:none;position:absolute;left:-9999px;';

      const cleanup = () => {
        window.removeEventListener('message', messageHandler);
        clearTimeout(timeoutId);
        if (iframe.parentNode) document.body.removeChild(iframe);
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('silent_renew_timeout'));
      }, 10_000);

      const messageHandler = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== 'silent_callback') return;

        cleanup();

        if (event.data.error) {
          reject(new Error(event.data.error));
          return;
        }

        try {
          const body = new HttpParams()
            .set('grant_type', 'authorization_code')
            .set('code', event.data.code)
            .set('redirect_uri', this.redirectUrl)
            .set('client_id', this.clientId)
            .set('code_verifier', verifier);

          const { access_token } = await firstValueFrom(
            this.http.post<any>(`${this.url}/token`, body, { withCredentials: true })
          );

          this.applyToken(access_token);
          resolve(access_token);
        } catch (err) {
          reject(err);
        }
      };

      window.addEventListener('message', messageHandler);

      const url = new URL(`${this.url}/authorize`);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', this.clientId);
      url.searchParams.set('redirect_uri', this.redirectUrl);
      url.searchParams.set('scope', this.scope);
      url.searchParams.set('prompt', 'none');
      url.searchParams.set('state', silentState);
      url.searchParams.set('code_challenge', challenge);
      url.searchParams.set('code_challenge_method', 'S256');

      iframe.src = url.toString();
      document.body.appendChild(iframe);
    });
  }

  async reauthorize(): Promise<void> {
    try {
      await this.silentRenew();
    } catch {
      await this.authorize();
    }
  }

  logout(): void {
    const params = new HttpParams().set('client_id', this.clientId);
    this.http.get(`${this.url}/logout`, { params, withCredentials: true })
      .subscribe({
        complete: () => this.onLogout(),
        error: () => this.onLogout(),
      });
  }

  private onLogout(): void {
    this.accessToken = null;
    this.isAuth.next(false);
    this.clearRenewTimer();
    if (this.expiryLogInterval) { clearInterval(this.expiryLogInterval); this.expiryLogInterval = null; }
    this.channel.postMessage({ type: 'LOGOUT' } as ChannelMessage);
    this.router.navigate(['/logoff'], { queryParams: { loggedOut: 'true' } });
  }
}
