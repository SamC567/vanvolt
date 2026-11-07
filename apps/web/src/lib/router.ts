/** Minimal hash router — keeps the app a static site with no server routing. */
import { useEffect, useState } from 'react';

export type Route =
  | 'overview'
  | 'loads'
  | 'battery'
  | 'solar'
  | 'charging'
  | 'inverter'
  | 'cables'
  | 'simulation'
  | 'diagram'
  | 'compare'
  | 'report'
  | 'projects'
  | 'sources';

export const ROUTES: Route[] = [
  'overview',
  'loads',
  'battery',
  'solar',
  'charging',
  'inverter',
  'cables',
  'simulation',
  'diagram',
  'compare',
  'report',
  'projects',
  'sources',
];

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Route;
  return ROUTES.includes(h) ? h : 'overview';
}

export function navigate(route: Route) {
  window.location.hash = `/${route}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
