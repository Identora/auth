# @identora/auth

Angular authentication library implementing the OAuth 2.0 Authorization Code flow with PKCE. Handles token acquisition, silent renewal, route guarding, and view state management for multi-realm applications.

## Entry Points

| Import path | Purpose |
|---|---|
| `@identora/auth` | Configuration token and interface |
| `@identora/auth/core` | Services, guard, and provider function |
| `@identora/auth/util` | Pure JWT and PKCE utilities |

---

## Installation

The library is published to npm as a scoped package:

```bash
npm install @identora/auth
```

---

## Setup

Register the library in your `app.config.ts` using `provideAuth`:

```ts
import { provideAuth } from '@identora/auth/core';
import { AUTH_CONFIG } from '@identora/auth';
import { environment } from 'src/environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAuth(environment.auth),
  ],
};
```

Or register the token directly if you need more control:

```ts
import { AUTH_CONFIG } from '@identora/auth';

providers: [
  { provide: AUTH_CONFIG, useValue: environment.auth },
]
```

### `AuthConfig`

```ts
interface AuthConfig {
  authority: string;    // Base URL of the identity provider (e.g. http://localhost:4000)
  realmId: string;      // Realm name or UUID (e.g. "master")
  clientId: string;     // OAuth client_id registered in the identity provider
  redirectUrl: string;  // Callback URL registered as redirect_uri
  responseType: string; // Always "code" for Authorization Code flow
  scope: string;        // Space-separated scopes (e.g. "openid profile email")
}
```

---

## `@identora/auth/core`

### `AuthorizationService`

Manages the full OAuth 2.0 + PKCE lifecycle.

```ts
import { AuthorizationService } from '@identora/auth/core';

@Component({ ... })
export class AppComponent {
  constructor(private auth: AuthorizationService) {}

  async ngOnInit() {
    await this.auth.initialize();   // Restore session or trigger authorization
  }
}
```

| Method / Property | Description |
|---|---|
| `initialize()` | Restores an existing session from storage. If no session exists, does nothing (call `authorize()` to start the flow). |
| `authorize()` | Generates a PKCE pair, stores the verifier, and redirects the browser to the identity provider's authorization endpoint. |
| `token(params)` | Exchanges an authorization code (or refresh token) for an access token. Called automatically by `CallbackComponent`. |
| `silentRenew()` | Attempts token renewal via a hidden iframe without user interaction. |
| `reauthorize()` | Clears current session and restarts the authorization flow. |
| `logout()` | Clears session storage and redirects to the identity provider's end-session endpoint. |
| `getToken()` | Returns the current access token string, or `null` if not authenticated. |
| `authenticated` | Boolean getter — `true` when a valid, non-expired token is held in memory. |
| `isAuth$` | `Observable<boolean>` — emits on every authentication state change. |

Token renewal is scheduled automatically when a token is applied. Renewal fires at 80 % of the token's lifetime, before expiry.

---

### `ViewService`

Manages the hierarchical route and breadcrumb state that drives `@identora/ui`'s navigation components. Every route change is reflected here.

```ts
import { ViewService } from '@identora/auth/core';

@Component({ ... })
export class MyComponent {
  constructor(private view: ViewService) {}

  ngOnInit() {
    this.view.currentView$.subscribe(view => console.log(view));
  }
}
```

| Method / Property | Description |
|---|---|
| `update(token)` | Fetches the view structure from the server for the current token and stores it. Called internally after authentication. |
| `view()` | Returns the raw `View` object for the current route. |
| `currentView$` | `Observable<View>` — emits whenever the active view changes. |
| `breadCrumb$` | `Observable<BreadCrumb[]>` — emits the breadcrumb trail for the current page. |
| `breadCrumb` | Synchronous getter for the current breadcrumb array. |
| `getLevel(url)` | Returns the hierarchy depth of a given URL segment. |
| `getUrlAtLevel(url, level)` | Extracts the URL segment at a specific hierarchy level (used by `ViewGuard`). |
| `getLevelControl(url)` | Returns the control structure for a given URL. |
| `updateBreadcrumb(routes)` | Manually sets the breadcrumb trail. |

---

### `RealmAppsService`

Fetches the list of registered applications for a realm. Used by the header's app launcher.

```ts
import { RealmAppsService } from '@identora/auth/core';

const apps = await realmAppsService.getApplications(token);
// Returns: AppDef[] — [{ id, name, app_url }]
```

---

### `PrivateGuard`

Route guard that blocks access to private routes when the user is not authenticated. Redirects to `/login` on failure.

```ts
import { PrivateGuard } from '@identora/auth/core';

const routes: Routes = [
  {
    path: 'dashboard',
    canActivate: [PrivateGuard],
    component: DashboardComponent,
  },
];
```

---

## `@identora/auth/util`

Pure utility functions with no Angular dependency — safe to use in services, guards, or plain TypeScript.

```ts
import { decodeJwt, isJwtExpired, generatePkcePair } from '@identora/auth/util';

const payload = decodeJwt<{ sub: string; exp: number }>(token);
const expired  = isJwtExpired(token);
const { verifier, challenge } = await generatePkcePair();
```

| Function | Signature | Description |
|---|---|---|
| `decodeJwt` | `<T>(token: string): T \| null` | Decodes the JWT payload without verifying the signature. |
| `isJwtExpired` | `(token: string): boolean` | Returns `true` if the token's `exp` claim is in the past. |
| `generatePkcePair` | `(): Promise<{ verifier: string; challenge: string }>` | Generates a random code verifier and its SHA-256 S256 challenge. |
| `generateCodeVerifier` | `(): string` | Generates a 128-character random Base64Url string. |
| `generateCodeChallenge` | `(verifier: string): Promise<string>` | Computes the S256 challenge for a given verifier using SubtleCrypto. |
| `base64UrlEncode` | `(bytes: Uint8Array): string` | Encodes a byte array as a Base64Url string (no padding). |

---

## Token lifecycle

```
App starts
  └─ initialize()
       ├─ valid token in storage → restore → schedule silent renewal
       └─ no token → idle (caller must invoke authorize())

authorize()
  └─ redirect to /authorize with PKCE challenge

Identity provider redirects to redirectUrl?code=...
  └─ CallbackComponent (from @identora/ui/shell)
       └─ token(params) → store access token → schedule renewal
```

Silent renewal runs inside a hidden iframe at 80 % of the token lifetime and replaces the token in memory without any page navigation.

---

## Peer dependencies

| Package | Version |
|---|---|
| `@angular/common` | `^19.0.0` |
| `@angular/core` | `^19.0.0` |
| `@angular/router` | `^19.0.0` |
| `rxjs` | `^7.0.0` |
