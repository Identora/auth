import { APP_INITIALIZER, EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { AUTH_CONFIG, AuthConfig } from '@cl4im/angular';
import { AuthorizationService } from './authorization.service';

export function provideAuth(config: AuthConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: AUTH_CONFIG, useValue: config },
    {
      provide: APP_INITIALIZER,
      useFactory: (auth: AuthorizationService) => () => auth.initialize(),
      deps: [AuthorizationService],
      multi: true,
    },
  ]);
}
