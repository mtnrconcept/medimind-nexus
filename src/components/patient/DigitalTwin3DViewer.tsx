import { lazy, Suspense, useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { Anchor as PopoverAnchor } from '@radix-ui/react-popover';
import { AlertTriangle, Eye, RotateCcw, Search, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent } from '@/components/ui/popover';
import type { PatientAlert } from '@/hooks/usePatientAlerts';
import type { AnatomyCategory, AnatomyPart } from '@/data/anatomyData';
import { ANATOMICAL_VIEWS, ATLAS_LAYERS, DEFAULT_ATLAS_LAYERS, groupLocalizedAlerts, locateAlert, type AtlasLayerId, type AnatomicalView } from '@/lib/anatomicalTwin';
import { getMeshAlertSelection } from '@/lib/anatomicalTwinInteractions';
import type { AtlasAlertHit } from './AnatomicalAtlas3D';
import AnatomySearch from './AnatomySearch';
import './anatomical-twin.css';

const AnatomicalAtlas3D = lazy(() => import('./AnatomicalAtlas3D'));

interface DigitalTwin3DViewerProps {
  alerts?: PatientAlert[];
  pathologyName?: string;
}

type AlertTarget = { kind: 'region'; organ: string } | { kind: 'mesh'; name: string; system?: string };

const DigitalTwin3DViewer = ({ alerts = [], pathologyName }: DigitalTwin3DViewerProps) => {
  const id = useId();
  const [view, setView] = useState<AnatomicalView>('front');
  const [opacity, setOpacity] = useState(100);
  const [visible, setVisible] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [mode, setMode] = useState<'image' | '3d'>('image');
  const [atlasLayers, setAtlasLayers] = useState<AtlasLayerId[]>(DEFAULT_ATLAS_LAYERS);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedPart, setSelectedPart] = useState<AnatomyPart | null>(null);
  const [categories, setCategories] = useState<AnatomyCategory[]>(['bone', 'organ', 'muscle', 'tooth', 'nerve', 'vessel']);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [loadedSources, setLoadedSources] = useState<string[]>([]);
  const [viewRevision, setViewRevision] = useState(0);
  const [alertTarget, setAlertTarget] = useState<AlertTarget | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const restoreFocusOnClose = useRef(true);
  const popupAnchor = useRef<{ getBoundingClientRect: () => DOMRect; contextElement?: HTMLElement }>({
    getBoundingClientRect: () => new DOMRect(),
  });
  const current = ANATOMICAL_VIEWS.find(candidate => candidate.id === view)!;
  const localized = groupLocalizedAlerts(alerts);
  const unlocalized = alerts.filter(alert => !locateAlert(alert.organ));
  const error = failedSources.includes(current.src);
  const loaded = loadedSources.includes(current.src);
  const selectedAlerts = alertTarget?.kind === 'mesh'
    ? getMeshAlertSelection(alertTarget.name, alertTarget.system, alerts)
    : alertTarget?.kind === 'region'
      ? localized.find(group => group.region.id === alertTarget.organ)
      : null;
  const popupLabel = selectedAlerts && ('label' in selectedAlerts ? selectedAlerts.label : selectedAlerts.region.label);
  const hasSelectedAlerts = Boolean(selectedAlerts);

  useEffect(() => {
    if (alertTarget && !hasSelectedAlerts) setAlertTarget(null);
  }, [alertTarget, hasSelectedAlerts]);

  const openAlert = (target: AlertTarget, anchor: HTMLElement, clientX: number, clientY: number, returnFocus = anchor) => {
    const bounds = anchor.getBoundingClientRect();
    const offsetX = clientX - bounds.left;
    const offsetY = clientY - bounds.top;
    popupAnchor.current = {
      contextElement: anchor,
      getBoundingClientRect: () => {
        const currentBounds = anchor.getBoundingClientRect();
        return new DOMRect(currentBounds.left + offsetX, currentBounds.top + offsetY, 0, 0);
      },
    };
    returnFocusRef.current = returnFocus;
    restoreFocusOnClose.current = true;
    setAlertTarget(target);
  };

  const openRegionAlert = (organ: string, event: MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    openAlert({ kind: 'region', organ }, event.currentTarget,
      event.detail === 0 ? bounds.left + bounds.width / 2 : event.clientX,
      event.detail === 0 ? bounds.top + bounds.height / 2 : event.clientY);
  };

  const openMeshAlert = (hit: AtlasAlertHit | null) => {
    if (!hit || !viewportRef.current) { setAlertTarget(null); return; }
    const focusTarget = viewportRef.current.querySelector<HTMLElement>('[aria-label="Atlas 3D interactif"]');
    openAlert({ kind: 'mesh', name: hit.name, system: hit.system }, viewportRef.current,
      hit.clientX, hit.clientY, focusTarget ?? viewportRef.current);
  };

  const changeView = (nextView: AnatomicalView) => {
    setView(nextView); setZoom(100); setViewRevision(value => value + 1); setAlertTarget(null);
  };

  const reset = () => {
    setView('front'); setOpacity(100); setVisible(true); setShowZones(true); setZoom(100); setSelectedPart(null); setAtlasLayers(DEFAULT_ATLAS_LAYERS);
    setViewRevision(value => value + 1); setAlertTarget(null);
  };

  return (
    <Card className="h-full overflow-y-auto" aria-label="Jumeau anatomique du patient">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg">Jumeau anatomique{pathologyName && <span className="ml-2 text-sm font-normal text-muted-foreground">{pathologyName}</span>}</CardTitle>
          <Button size="sm" variant={searchOpen ? 'secondary' : 'outline'} onClick={() => setSearchOpen(value => !value)} aria-expanded={searchOpen} aria-controls={`${id}-search`}><Search className="mr-2 h-4 w-4" />Anatomie</Button>
        </div>
        <p className="text-xs text-muted-foreground">Atlas anatomique de référence : 19 systèmes, sans reconstruction propre au patient. Les alertes proviennent du dossier.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Mode anatomique">
          <Button size="sm" variant={mode === 'image' ? 'default' : 'outline'} aria-pressed={mode === 'image'} onClick={() => { setMode('image'); setAlertTarget(null); }}>Vue illustrée</Button>
          <Button size="sm" variant={mode === '3d' ? 'default' : 'outline'} aria-pressed={mode === '3d'} onClick={() => { setMode('3d'); setAlertTarget(null); }}>Ouvrir l’atlas 3D (49 Mo)</Button>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Orientation anatomique">
          {ANATOMICAL_VIEWS.map(candidate => <Button key={candidate.id} size="sm" variant={view === candidate.id ? 'default' : 'outline'} aria-pressed={view === candidate.id} onClick={() => changeView(candidate.id)}>{candidate.label}</Button>)}
          <Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" />Réinitialiser</Button>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0 space-y-3">
            <div ref={viewportRef}>
            {mode === '3d' ? <div className="h-[480px] rounded-xl border bg-slate-950"><Suspense fallback={<p role="status" className="p-6 text-sm text-white">Chargement du visualiseur…</p>}><AnatomicalAtlas3D layers={atlasLayers} opacity={opacity} alerts={alerts} pulse={showZones} view={view} viewRevision={viewRevision} onAlertSelect={openMeshAlert} /></Suspense></div> : <div className="relative overflow-auto rounded-xl border bg-slate-950" style={{ maxHeight: 560 }} aria-busy={!loaded && !error}>
              <div className="relative mx-auto aspect-square min-w-[280px]" style={{ width: `${zoom}%` }}>
                <img key={current.src} src={current.src} alt={`Squelette humain — ${current.label.toLowerCase()}`} width={1254} height={1254}
                  className="absolute inset-0 h-full w-full object-contain transition-opacity"
                  style={{ opacity: visible ? opacity / 100 : 0 }}
                  onLoad={() => setLoadedSources(previous => previous.includes(current.src) ? previous : [...previous, current.src])}
                  onError={() => setFailedSources(previous => previous.includes(current.src) ? previous : [...previous, current.src])} />
                {!loaded && !error && <p role="status" className="absolute inset-0 grid place-items-center text-sm text-white">Chargement de la vue…</p>}
                {error && <p role="alert" className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-red-300">Cette vue anatomique n’a pas pu être chargée. Sélectionnez une autre vue.</p>}
                {loaded && !error && view === 'front' && showZones && localized.map(({ region, alerts: regionAlerts, critical }) => (
                  <button key={region.id} type="button" className={`anatomical-alert-zone ${critical ? 'is-critical' : ''}`}
                    style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }}
                    aria-label={`${region.label} : ${regionAlerts.map(alert => alert.title).join(', ')}`}
                    aria-haspopup="dialog"
                    title={`${region.label} : ${regionAlerts.map(alert => alert.title).join(', ')}`}
                    onClick={event => openRegionAlert(region.id, event)} />
                ))}
              </div>
            </div>}
            </div>
            {mode === 'image' && view !== 'front' && localized.length > 0 && <p className="text-xs text-muted-foreground">La localisation des alertes est disponible en vue de face. Les alertes restent consultables ci-dessous.</p>}
            {mode === 'image' ? <label className="flex items-center gap-3 text-sm">Zoom<Slider aria-label="Zoom anatomique" min={100} max={200} step={25} value={[zoom]} onValueChange={([value]) => setZoom(value)} /><span className="w-12 text-right">{zoom}%</span></label> : <div className="space-y-1 text-xs text-muted-foreground"><p>Clic sur une zone signalée : motif de l’alerte. Glisser avec le clic gauche : tourner. Ctrl + clic gauche ou clic droit maintenu : déplacer. Molette : zoomer.</p><p>Sur écran tactile : un doigt pour tourner, deux pour déplacer ou zoomer.</p><p>BodyParts3D / DBCLS — CC BY 4.0, géométrie Open Anatomy Atlas. <a className="underline" href="https://lifesciencedb.jp/bp3d/" target="_blank" rel="noreferrer">Source</a> · <a className="underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">Licence</a></p></div>}
            {selectedPart && <div className="rounded-lg border p-3 text-sm" role="status"><strong>{selectedPart.name}</strong><p className="text-muted-foreground">{selectedPart.description || selectedPart.nameEn}</p><p className="mt-1 text-xs text-muted-foreground">Référence anatomique générale ; localisation précise non validée sur ces illustrations.</p></div>}
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Calques anatomiques</h3>
            {mode === 'image' ? <div className="space-y-3 rounded-lg border p-3">
              <label className="flex items-center justify-between gap-2 text-sm"><span>Squelette</span><Switch aria-label="Afficher le squelette" checked={visible} onCheckedChange={setVisible} /></label>
              <label className="flex items-center gap-2 text-xs">Opacité<Slider aria-label="Opacité du squelette" min={0} max={100} step={5} disabled={!visible} value={[opacity]} onValueChange={([value]) => setOpacity(value)} /><span>{opacity}%</span></label>
            </div> : <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-lg border p-3">{ATLAS_LAYERS.map(([layerId, label]) => <label key={layerId} className="flex items-center justify-between gap-2 text-sm"><span>{label}</span><Switch aria-label={`Afficher ${label}`} checked={atlasLayers.includes(layerId)} onCheckedChange={checked => { setAtlasLayers(previous => checked ? [...previous, layerId] : previous.filter(item => item !== layerId)); setAlertTarget(null); }} /></label>)}<label className="flex items-center gap-2 text-xs">Opacité<Slider aria-label="Opacité de l’atlas" min={5} max={100} step={5} value={[opacity]} onValueChange={([value]) => setOpacity(value)} /></label></div>}
            {mode === 'image' && <p className="text-xs text-muted-foreground">Les muscles, organes, tissus et autres systèmes sont accessibles dans l’atlas 3D. Les calques illustrés correspondants ne sont pas disponibles.</p>}
            <label className="flex items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2"><Eye className="h-4 w-4" />Zones d’alerte</span><Switch aria-label="Afficher les zones d’alerte" checked={showZones} onCheckedChange={checked => { setShowZones(checked); setAlertTarget(null); }} /></label>
            {mode === '3d' && <p className="text-xs text-muted-foreground">Seules les structures présentes et identifiées dans l’atlas peuvent être colorées. Un système masqué ou une zone non colorée n’exclut aucun risque ; consultez la liste des alertes.</p>}
          </div>
        </div>
        {searchOpen && <div id={`${id}-search`}><AnatomySearch selectedPart={selectedPart} onSelectPart={setSelectedPart} visibleCategories={categories}
          onToggleCategory={category => setCategories(previous => previous.includes(category) ? previous.filter(item => item !== category) : [...previous, category])}
          markersVisible={showZones} onToggleMarkers={() => setShowZones(value => !value)} /></div>}
        <section aria-label="Alertes du dossier" className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4" />{alerts.length} alerte{alerts.length > 1 ? 's' : ''} du dossier</h3>
          {alerts.length === 0 && <p className="text-sm text-muted-foreground">Aucune alerte transmise à cette vue. Cela ne confirme pas l’absence de risque.</p>}
          {localized.map(({ region, alerts: regionAlerts }) => <div id={`${id}-${region.id}`} key={region.id} className="rounded-lg border p-3"><h4 className="text-sm font-medium"><button type="button" className="min-h-9 rounded text-left underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Voir les alertes : ${region.label}`} aria-haspopup="dialog" onClick={event => openRegionAlert(region.id, event)}>{region.label}</button></h4>{regionAlerts.map(alert => <AlertDetail key={alert.id} alert={alert} />)}</div>)}
          {unlocalized.length > 0 && <div className="rounded-lg border p-3"><h4 className="text-sm font-medium">Autres alertes du dossier</h4>{unlocalized.map(alert => <AlertDetail key={alert.id} alert={alert} />)}</div>}
        </section>
        <Popover open={Boolean(selectedAlerts)} onOpenChange={open => { if (!open) setAlertTarget(null); }}>
          <PopoverAnchor virtualRef={popupAnchor} />
          <PopoverContent side="bottom" align="start" sideOffset={12} collisionPadding={12}
            className="w-[min(22rem,calc(100vw-1.5rem))] max-h-[min(28rem,var(--radix-popover-content-available-height))] overflow-y-auto"
            aria-labelledby={`${id}-alert-popup-title`}
            onInteractOutside={() => { restoreFocusOnClose.current = false; }}
            onCloseAutoFocus={event => { event.preventDefault(); if (restoreFocusOnClose.current && returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true }); }}>
            <div className="flex items-start justify-between gap-3">
              <div><h3 id={`${id}-alert-popup-title`} className="font-semibold">Pourquoi cette alerte ?</h3><p className="mt-1 text-sm text-muted-foreground">{popupLabel}</p></div>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Fermer le détail des alertes" onClick={() => setAlertTarget(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="mt-3 space-y-3 divide-y">{selectedAlerts?.alerts.map(alert => <AlertDetail key={alert.id} alert={alert} showLabels />)}</div>
          </PopoverContent>
        </Popover>
      </CardContent>
    </Card>
  );
};

function AlertDetail({ alert, showLabels = false }: { alert: PatientAlert; showLabels?: boolean }) {
  return <div className="mt-2 pt-1 text-sm"><p className={alert.level === 'CRITICAL' ? 'font-semibold text-destructive' : 'font-medium'}>{alert.level === 'CRITICAL' ? 'Critique' : alert.level === 'WARNING' ? 'Attention' : 'Information'} — {alert.title}</p><p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{showLabels && <span className="font-medium">Motif : </span>}{alert.description || 'Aucune précision supplémentaire dans cette alerte du dossier.'}</p>{alert.action && <p className="mt-2 whitespace-pre-wrap break-words text-xs">{showLabels && <span className="font-medium">Consigne associée : </span>}{alert.action}</p>}</div>;
}

export default DigitalTwin3DViewer;
