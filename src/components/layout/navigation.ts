/** One source of truth for the clinical workspace's navigation and page context. */
export type WorkspaceRole = 'admin' | 'doctor' | 'researcher' | null;

export interface WorkspaceLink {
  id: string;
  label: string;
  path: string;
  icon: string;
}

export interface WorkspaceGroup {
  id: string;
  label: string;
  items: WorkspaceLink[];
}

interface RouteInfo {
  title: string;
  section: string;
  parentPath?: string;
}

const clinical: WorkspaceLink[] = [
  { id: 'home', label: 'Vue d’ensemble', path: '/dashboard', icon: 'dashboard' },
  { id: 'patients', label: 'Patients', path: '/patients', icon: 'patients' },
  { id: 'pathologies', label: 'Pathologies', path: '/pathologies', icon: 'pathologies' },
  { id: 'analysis', label: 'Analyses croisées', path: '/cross-data-analysis', icon: 'analysis' },
  { id: 'search', label: 'Recherche médicale', path: '/search', icon: 'search' },
];

const research: WorkspaceLink[] = [
  { id: 'discovery', label: 'Découverte continue', path: '/continuous-discovery', icon: 'discovery' },
  { id: 'research-platform', label: 'Plateforme de recherche', path: '/discovery-platform', icon: 'research' },
];

const advancedTools: WorkspaceLink[] = [
  { id: 'molecule', label: 'Atelier moléculaire', path: '/tools/molecule-workbench', icon: 'molecule' },
  { id: 'switch', label: 'Calculateur de switch', path: '/tools/switch-calculator', icon: 'calculator' },
];

const administration: WorkspaceLink[] = [
  { id: 'admin', label: 'Administration', path: '/admin', icon: 'admin' },
  { id: 'import', label: 'Importer des données', path: '/populate-data', icon: 'import' },
];

/** Links are UI hints; actual authorization remains enforced at route and RLS layers. */
export function buildNavigation(role: WorkspaceRole): WorkspaceGroup[] {
  return [
    { id: 'clinical', label: 'Espace clinique', items: clinical },
    {
      id: 'research',
      label: 'Recherche',
      items: role === 'admin'
        ? [...research, { id: 'lab', label: 'Laboratoire de microsignaux', path: '/research/microsignals', icon: 'microsignals' }]
        : research,
    },
    { id: 'tools', label: 'Outils spécialisés', items: advancedTools },
    ...(role === 'admin' ? [{ id: 'administration', label: 'Administration', items: administration }] : []),
  ];
}

const pageContext: Record<string, RouteInfo> = {
  '/': { title: 'MediCore', section: 'Accueil' },
  '/auth': { title: 'Connexion', section: 'Accès' },
  '/dashboard': { title: 'Vue d’ensemble', section: 'Espace clinique' },
  '/patients': { title: 'Patients', section: 'Espace clinique' },
  '/pathologies': { title: 'Pathologies', section: 'Espace clinique' },
  '/cross-data-analysis': { title: 'Analyses croisées', section: 'Espace clinique' },
  '/search': { title: 'Recherche médicale', section: 'Espace clinique' },
  '/continuous-discovery': { title: 'Découverte continue', section: 'Recherche' },
  '/discovery-platform': { title: 'Plateforme de recherche', section: 'Recherche' },
  '/research/microsignals': { title: 'Laboratoire de microsignaux', section: 'Recherche' },
  '/tools/molecule-workbench': { title: 'Atelier moléculaire', section: 'Outils spécialisés' },
  '/tools/switch-calculator': { title: 'Calculateur de switch', section: 'Outils spécialisés' },
  '/admin': { title: 'Administration', section: 'Administration' },
  '/populate-data': { title: 'Importer des données', section: 'Administration' },
};

/** Do not derive titles from private patient identifiers in route segments. */
export function getRouteInfo(pathname: string): RouteInfo {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';
  if (pageContext[path]) return pageContext[path];
  if (/^\/patients\/[^/]+$/.test(path)) {
    return { title: 'Dossier patient', section: 'Espace clinique', parentPath: '/patients' };
  }
  if (/^\/pathologies\/[^/]+$/.test(path)) {
    return { title: 'Fiche pathologie', section: 'Espace clinique', parentPath: '/pathologies' };
  }
  return { title: 'MediCore', section: 'Espace clinique' };
}

export function isNavigationActive(itemPath: string, pathname: string): boolean {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';
  return path === itemPath ||
    ((itemPath === '/patients' || itemPath === '/pathologies') && path.startsWith(`${itemPath}/`));
}
