import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Activity, TrendingUp, AlertTriangle } from 'lucide-react';

interface HeatmapData {
  category: string;
  count: number;
  resolvedRate: number;
  sideEffectRate: number;
}

const KnowledgeHeatmap = () => {
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHeatmapData = async () => {
      try {
        // Fetch patients with their pathologies
        const { data: patients } = await supabase
          .from('patients')
          .select(`
            outcome,
            pathology_id,
            pathologies (
              category
            )
          `);

        if (patients) {
          // Group by category and calculate rates
          const categoryMap = new Map<string, { total: number; resolved: number; sideEffect: number }>();
          
          patients.forEach((p: any) => {
            const category = p.pathologies?.category || 'Non classé';
            if (!categoryMap.has(category)) {
              categoryMap.set(category, { total: 0, resolved: 0, sideEffect: 0 });
            }
            const data = categoryMap.get(category)!;
            data.total++;
            if (p.outcome === 'RESOLVED') data.resolved++;
            if (p.outcome === 'SIDE_EFFECT') data.sideEffect++;
          });

          const result: HeatmapData[] = [];
          categoryMap.forEach((value, key) => {
            result.push({
              category: key,
              count: value.total,
              resolvedRate: value.total > 0 ? (value.resolved / value.total) * 100 : 0,
              sideEffectRate: value.total > 0 ? (value.sideEffect / value.total) * 100 : 0,
            });
          });

          // Sort by count descending
          result.sort((a, b) => b.count - a.count);
          setHeatmapData(result.slice(0, 12)); // Top 12 categories
        }
      } catch (error) {
        console.error('Error fetching heatmap data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHeatmapData();
  }, []);

  const getHeatmapColor = (resolvedRate: number, sideEffectRate: number) => {
    if (sideEffectRate > 20) return 'bg-destructive/20 border-destructive/50 text-destructive';
    if (resolvedRate > 70) return 'bg-green-500/20 border-green-500/50 text-green-700 dark:text-green-400';
    if (resolvedRate > 40) return 'bg-yellow-500/20 border-yellow-500/50 text-yellow-700 dark:text-yellow-400';
    return 'bg-orange-500/20 border-orange-500/50 text-orange-700 dark:text-orange-400';
  };

  const getStatusIcon = (resolvedRate: number, sideEffectRate: number) => {
    if (sideEffectRate > 20) return <AlertTriangle className="h-4 w-4" />;
    if (resolvedRate > 70) return <TrendingUp className="h-4 w-4" />;
    return <Activity className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Knowledge Heatmap
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Knowledge Heatmap
        </CardTitle>
        <CardDescription>
          Vue d'ensemble des pathologies par données disponibles et taux de succès
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {heatmapData.map((item) => (
            <div
              key={item.category}
              className={`p-3 rounded-lg border-2 transition-all hover:scale-105 cursor-pointer ${getHeatmapColor(item.resolvedRate, item.sideEffectRate)}`}
            >
              <div className="flex items-start justify-between mb-2">
                {getStatusIcon(item.resolvedRate, item.sideEffectRate)}
                <span className="text-xs font-mono">{item.count}</span>
              </div>
              <h4 className="font-medium text-sm truncate">{item.category}</h4>
              <div className="mt-1 text-xs opacity-75">
                <span>{item.resolvedRate.toFixed(0)}% résolu</span>
                {item.sideEffectRate > 0 && (
                  <span className="ml-2">• {item.sideEffectRate.toFixed(0)}% EI</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-green-500/50" />
            <span>Bien documenté (&gt;70% résolu)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-yellow-500/50" />
            <span>Données modérées</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-destructive/50" />
            <span>Effets secondaires fréquents</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default KnowledgeHeatmap;
