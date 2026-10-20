import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { NavKey } from './models';
import { Access } from './access.service';

/** Allow a screen only if the current role has it in its menu. */
export const navGuard = (key: NavKey): CanActivateFn => () => {
  const access = inject(Access);
  return access.navAllowed(key) || inject(Router).createUrlTree(['/', access.home()]);
};

/** "/" sends everyone to their role's landing screen. */
export const homeGuard: CanActivateFn = () => {
  const access = inject(Access);
  return inject(Router).createUrlTree(['/', access.home()]);
};
