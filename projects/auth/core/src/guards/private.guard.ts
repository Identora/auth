import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, CanActivateChild, Router, RouterStateSnapshot } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AuthorizationService } from '../authorization.service';

@Injectable({ providedIn: 'root' })
export class PrivateGuard implements CanActivate, CanActivateChild {

  constructor(
    private auth: AuthorizationService,
    private router: Router
  ) {}

  canActivate(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    return this.checkAuthState(state.url);
  }

  canActivateChild(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    return this.checkAuthState(state.url);
  }

  private checkAuthState(_url: string): Observable<boolean> {
    if (this.auth.authenticated) return of(true);
    this.auth.authorize();
    return of(false);
  }
}
