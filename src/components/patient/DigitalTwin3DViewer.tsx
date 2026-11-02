import { lazy, Suspense, useId, useState } from 'react';
import { AlertTriangle, Eye, RotateCcw, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { PatientAlert } from '@/hooks/usePatientAlerts';
import type { AnatomyCategory, AnatomyPart } from '@/data/anatomyData';
import { ANATOMICAL_VIEWS, ATLAS_LAYERS, DEFAULT_ATLAS_LAYERS, groupLocalizedAlerts, locateAlert, type AtlasLayerId, type AnatomicalView } from '@/lib/anatomicalTwin';
import AnatomySearch from './AnatomySearch';
import './anatomical-twin.css';

const AnatomicalAtlas3D = lazy(() => import('./AnatomicalAtlas3D'));

interface DigitalTwin3DViewerProps {
  alerts?: PatientAlert[];
  pathologyName?: string;
}

const DigitalTwin3DViewer = ({ alerts = [], pathologyName }: DigitalTwin3DViewerProps) => {
  const id = useId();
  const [view, setView] = useState<AnatomicalView>('front');
  const [opacity, setOpacity] = useState(100);
  const [visible, setVisible] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [mode, setMode] = useState<'image' | '3d'>('3d');
  const [cameraRevision, setCameraRevision] = useState(0);
  const [atlasLayers, setAtlasLayers] = useState<AtlasLayerId[]>(DEFAULT_ATLAS_LAYERS);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedPart, setSelectedPart] = useState<AnatomyPart | null>(null);
  const [categories, setCategories] = useState<AnatomyCategory[]>(['bone', 'organ', 'muscle', 'tooth', 'nerve', 'vessel']);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [loadedSources, setLoadedSources] = useState<string[]>([]);
  const current = ANATOMICAL_VIEWS.find(candidate => candidate.id === view)!;
  const localized = groupLocalizedAlerts(alerts);
  const unlocalized = alerts.filter(alert => !locateAlert(alert.organ));
  const error = failedSources.includes(current.src);
  const loaded = loadedSources.includes(current.src);

  const reset = () => {
    setView('front'); setOpacity(100); setVisible(true); setShowZones(true); setZoom(100); setSelectedPart(null); setAtlasLayers(DEFAULT_ATLAS_LAYERS);
    setCameraRevision(value => value + 1);
  };

  const selectView = (nextView: AnatomicalView) => {
    setView(nextView);
    setZoom(100);
    setCameraRevision(value => value + 1);
  };

  const toggleLayer = (layerId: AtlasLayerId, checked: boolean) => {
    setAtlasLayers(previous => checked ? previous.includes(layerId) ? previous : [...previous, layerId] : previous.filter(item => item !== layerId));
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
          <Button size="sm" variant={mode === 'image' ? 'default' : 'outline'} aria-pressed={mode === 'image'} onClick={() => setMode('image')}>Vue illustrée</Button>
          <Button size="sm" variant={mode === '3d' ? 'default' : 'outline'} aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>Atlas 3D · 19 calques</Button>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Orientation anatomique">
          {ANATOMICAL_VIEWS.map(candidate => <Button key={candidate.id} size="sm" variant={view === candidate.id ? 'default' : 'outline'} aria-pressed={view === candidate.id} onClick={() => selectView(candidate.id)}>{candidate.label}</Button>)}
          <Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" />Réinitialiser</Button>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0 space-y-3">
            {mode === '3d' ? <div className="anatomical-atlas-canvas h-[min(60vh,560px)] min-h-[340px] rounded-xl border bg-slate-950"><Suspense fallback={<p role="status" className="p-6 text-sm text-white">Chargement du visualiseur…</p>}><AnatomicalAtlas3D layers={atlasLayers} opacity={opacity} alerts={alerts} pulse={showZones} view={view} cameraRevision={cameraRevision} /></Suspense></div> : <div className="relative overflow-auto rounded-xl border bg-slate-950" style={{ maxHeight: 560 }} aria-busy={!loaded && !error}>
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
                    title={`${region.label} : ${regionAlerts.map(alert => alert.title).join(', ')}`}
                    onClick={() => document.getElementById(`${id}-${region.id}`)?.focus()} />
                ))}
              </div>
            </div>}
            {mode === 'image' && view !== 'front' && localized.length > 0 && <p className="text-xs text-muted-foreground">La localisation des alertes est disponible en vue de face. Les alertes restent consultables ci-dessous.</p>}
            {mode === 'image' ? <label className="flex items-center gap-3 text-sm">Zoom<Slider aria-label="Zoom anatomique" min={100} max={200} step={25} value={[zoom]} onValueChange={([value]) => setZoom(value)} /><span className="w-12 text-right">{zoom}%</span></label> : <p className="text-xs text-muted-foreground">Tourner : glisser avec un doigt ou le bouton gauche. Déplacer : deux doigts ou bouton droit. Zoom : pincer ou utiliser la molette. Un nouveau clic sur Face/Dos/Profil recentre la vue. Modèle 3D de 49 Mo chargé une seule fois. BodyParts3D / DBCLS — CC BY 4.0, géométrie Open Anatomy Atlas. <a className="underline" href="https://lifesciencedb.jp/bp3d/" target="_blank" rel="noreferrer">Source</a> · <a className="underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">Licence</a></p>}
            {selectedPart && <div className="rounded-lg border p-3 text-sm" role="status"><strong>{selectedPart.name}</strong><p className="text-muted-foreground">{selectedPart.description || selectedPart.nameEn}</p><p className="mt-1 text-xs text-muted-foreground">Référence anatomique générale ; localisation précise non validée sur ces illustrations.</p></div>}
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Calques anatomiques</h3>
            {mode === 'image' ? <div className="space-y-3 rounded-lg border p-3">
              <label className="flex items-center justify-between gap-2 text-sm"><span>Squelette</span><Switch aria-label="Afficher le squelette" checked={visible} onCheckedChange={setVisible} /></label>
              <label className="flex items-center gap-2 text-xs">Opacité<Slider aria-label="Opacité du squelette" min={0} max={100} step={5} disabled={!visible} value={[opacity]} onValueChange={([value]) => setOpacity(value)} /><span>{opacity}%</span></label>
            </div> : <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-lg border p-3"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setAtlasLayers(ATLAS_LAYERS.map(([layerId]) => layerId))}>Tout afficher</Button><Button size="sm" variant="outline" onClick={() => setAtlasLayers([])}>Tout masquer</Button><span className="self-center text-xs text-muted-foreground" role="status">{atlasLayers.length} / {ATLAS_LAYERS.length} calques visibles</span></div>{ATLAS_LAYERS.map(([layerId, label]) => <label key={layerId} className="flex items-center justify-between gap-2 text-sm"><span>{label}</span><Switch aria-label={`Afficher ${label}`} checked={atlasLayers.includes(layerId)} onCheckedChange={checked => toggleLayer(layerId, checked)} /></label>)}<label className="flex items-center gap-2 text-xs">Opacité<Slider aria-label="Opacité de l’atlas" min={5} max={100} step={5} value={[opacity]} onValueChange={([value]) => setOpacity(value)} /></label></div>}
            {mode === 'image' && <p className="text-xs text-muted-foreground">Les muscles, organes, tissus et autres systèmes sont accessibles dans l’atlas 3D. Les calques illustrés correspondants ne sont pas disponibles.</p>}
            <label className="flex items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2"><Eye className="h-4 w-4" />Zones d’alerte</span><Switch aria-label="Afficher les zones d’alerte" checked={showZones} onCheckedChange={setShowZones} /></label>
            {mode === '3d' && <p className="text-xs text-muted-foreground">Seules les structures présentes et identifiées dans l’atlas peuvent être colorées. Un système masqué ou une zone non colorée n’exclut aucun risque ; consultez la liste des alertes.</p>}
          </div>
        </div>
        {searchOpen && <div id={`${id}-search`}><AnatomySearch selectedPart={selectedPart} onSelectPart={setSelectedPart} visibleCategories={categories}
          onToggleCategory={category => setCategories(previous => previous.includes(category) ? previous.filter(item => item !== category) : [...previous, category])}
          markersVisible={showZones} onToggleMarkers={() => setShowZones(value => !value)} /></div>}
        <section aria-label="Alertes du dossier" className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4" />{alerts.length} alerte{alerts.length > 1 ? 's' : ''} du dossier</h3>
          {alerts.length === 0 && <p className="text-sm text-muted-foreground">Aucune alerte transmise à cette vue. Cela ne confirme pas l’absence de risque.</p>}
          {localized.map(({ region, alerts: regionAlerts }) => <div id={`${id}-${region.id}`} tabIndex={-1} key={region.id} className="rounded-lg border p-3 focus:outline-none focus:ring-2 focus:ring-primary"><h4 className="text-sm font-medium">{region.label}</h4>{regionAlerts.map(alert => <AlertDetail key={alert.id} alert={alert} />)}</div>)}
          {unlocalized.length > 0 && <div className="rounded-lg border p-3"><h4 className="text-sm font-medium">Alertes sans localisation anatomique établie</h4>{unlocalized.map(alert => <AlertDetail key={alert.id} alert={alert} />)}</div>}
        </section>
      </CardContent>
    </Card>
  );
};

function AlertDetail({ alert }: { alert: PatientAlert }) {
  return <div className="mt-2 text-sm"><p className={alert.level === 'CRITICAL' ? 'font-semibold text-destructive' : 'font-medium'}>{alert.level === 'CRITICAL' ? 'Critique' : alert.level === 'WARNING' ? 'Attention' : 'Information'} — {alert.title}</p><p className="text-muted-foreground">{alert.description}</p>{alert.action && <p className="mt-1 text-xs">{alert.action}</p>}</div>;
}

export default DigitalTwin3DViewer;
