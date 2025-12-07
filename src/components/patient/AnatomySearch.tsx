import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Search, 
  Bone, 
  Heart, 
  Activity, 
  CircleDot,
  ChevronDown,
  ChevronUp,
  X,
  Eye,
  EyeOff,
  MapPin
} from 'lucide-react';
import { 
  AnatomyPart, 
  AnatomyCategory, 
  AnatomyRegion,
  ALL_ANATOMY_PARTS,
  ANATOMY_STATS,
  searchParts,
  getPartsByCategory,
  getPartsByRegion 
} from '@/data/anatomyData';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface AnatomySearchProps {
  selectedPart: AnatomyPart | null;
  onSelectPart: (part: AnatomyPart | null) => void;
  visibleCategories: AnatomyCategory[];
  onToggleCategory: (category: AnatomyCategory) => void;
  markersVisible: boolean;
  onToggleMarkers: () => void;
}

const CATEGORY_CONFIG: Record<AnatomyCategory, { label: string; icon: React.ReactNode; color: string }> = {
  bone: { label: 'Os', icon: <Bone className="h-4 w-4" />, color: '#f5f5dc' },
  organ: { label: 'Organes', icon: <Heart className="h-4 w-4" />, color: '#e74c3c' },
  muscle: { label: 'Muscles', icon: <Activity className="h-4 w-4" />, color: '#c0392b' },
  tooth: { label: 'Dents', icon: <CircleDot className="h-4 w-4" />, color: '#ffffff' },
  nerve: { label: 'Nerfs', icon: <Activity className="h-4 w-4" />, color: '#9b59b6' },
  vessel: { label: 'Vaisseaux', icon: <Activity className="h-4 w-4" />, color: '#3498db' },
};

const REGION_LABELS: Record<AnatomyRegion, string> = {
  head: 'Tête',
  neck: 'Cou',
  trunk: 'Tronc',
  arm_left: 'Bras gauche',
  arm_right: 'Bras droit',
  leg_left: 'Jambe gauche',
  leg_right: 'Jambe droite',
  hand_left: 'Main gauche',
  hand_right: 'Main droite',
  foot_left: 'Pied gauche',
  foot_right: 'Pied droit',
};

const AnatomySearch: React.FC<AnatomySearchProps> = ({
  selectedPart,
  onSelectPart,
  visibleCategories,
  onToggleCategory,
  markersVisible,
  onToggleMarkers,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<AnatomyRegion | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isResultsOpen, setIsResultsOpen] = useState(true);

  const filteredParts = useMemo(() => {
    let results = searchQuery.length > 0 
      ? searchParts(searchQuery)
      : ALL_ANATOMY_PARTS;
    
    // Filter by visible categories
    results = results.filter(part => visibleCategories.includes(part.category));
    
    // Filter by region if selected
    if (selectedRegion) {
      results = results.filter(part => part.region === selectedRegion);
    }
    
    return results.slice(0, 50); // Limit results for performance
  }, [searchQuery, visibleCategories, selectedRegion]);

  const categoryStats = useMemo(() => {
    return {
      bone: ANATOMY_STATS.bones,
      tooth: ANATOMY_STATS.teeth,
      organ: ANATOMY_STATS.organs,
      muscle: ANATOMY_STATS.muscles,
    };
  }, []);

  return (
    <div className="space-y-3">
      {/* Global Toggle */}
      <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">Marqueurs anatomiques</Label>
        </div>
        <Switch
          checked={markersVisible}
          onCheckedChange={onToggleMarkers}
        />
      </div>

      {markersVisible && (
        <>
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher (ex: fémur, cœur...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Category Filters */}
          <Collapsible open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="text-sm">Filtres par catégorie</span>
                {isFiltersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {(Object.keys(CATEGORY_CONFIG) as AnatomyCategory[])
                .filter(cat => cat !== 'nerve' && cat !== 'vessel') // Only show main categories
                .map((category) => {
                  const config = CATEGORY_CONFIG[category];
                  const isVisible = visibleCategories.includes(category);
                  const count = categoryStats[category as keyof typeof categoryStats] || 0;
                  
                  return (
                    <div
                      key={category}
                      className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                        isVisible ? 'bg-primary/10 border-primary/30' : 'bg-muted/30 border-border opacity-60'
                      }`}
                      onClick={() => onToggleCategory(category)}
                    >
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: config.color }}
                        />
                        {config.icon}
                        <span className="text-sm">{config.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {count}
                        </Badge>
                        {isVisible ? (
                          <Eye className="h-4 w-4 text-primary" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  );
                })}
            </CollapsibleContent>
          </Collapsible>

          {/* Region Filter */}
          <div className="flex flex-wrap gap-1">
            <Button
              variant={selectedRegion === null ? "default" : "outline"}
              size="sm"
              className="text-xs h-7"
              onClick={() => setSelectedRegion(null)}
            >
              Tout
            </Button>
            {(['head', 'trunk', 'arm_left', 'leg_left'] as AnatomyRegion[]).map((region) => (
              <Button
                key={region}
                variant={selectedRegion === region ? "default" : "outline"}
                size="sm"
                className="text-xs h-7"
                onClick={() => setSelectedRegion(region)}
              >
                {REGION_LABELS[region]}
              </Button>
            ))}
          </div>

          {/* Selected Part Info */}
          {selectedPart && (
            <div className="p-3 bg-primary/10 rounded-lg border border-primary/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: CATEGORY_CONFIG[selectedPart.category]?.color }}
                  />
                  <span className="text-sm font-medium">{selectedPart.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onSelectPart(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="text-xs text-muted-foreground italic">{selectedPart.nameEn}</div>
              {selectedPart.description && (
                <div className="text-xs text-muted-foreground mt-1">{selectedPart.description}</div>
              )}
              {selectedPart.system && (
                <Badge variant="outline" className="text-xs mt-2">{selectedPart.system}</Badge>
              )}
            </div>
          )}

          {/* Search Results */}
          <Collapsible open={isResultsOpen} onOpenChange={setIsResultsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="text-sm">
                  Résultats ({filteredParts.length}{filteredParts.length === 50 ? '+' : ''})
                </span>
                {isResultsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="h-[200px] mt-2">
                <div className="space-y-1 pr-2">
                  {filteredParts.map((part) => {
                    const config = CATEGORY_CONFIG[part.category];
                    const isSelected = selectedPart?.id === part.id;
                    
                    return (
                      <div
                        key={part.id}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-primary/20 border border-primary/50' 
                            : 'hover:bg-muted/50 border border-transparent'
                        }`}
                        onClick={() => onSelectPart(part)}
                      >
                        <div 
                          className="w-2 h-2 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: config?.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{part.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{part.nameEn}</div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {filteredParts.length === 0 && (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      Aucun résultat trouvé
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>

          {/* Stats */}
          <div className="text-xs text-muted-foreground text-center pt-2 border-t">
            {ANATOMY_STATS.total} parties anatomiques • {ANATOMY_STATS.bones} os • {ANATOMY_STATS.teeth} dents • {ANATOMY_STATS.organs} organes • {ANATOMY_STATS.muscles} muscles
          </div>
        </>
      )}
    </div>
  );
};

export default AnatomySearch;
