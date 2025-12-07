import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TestTube, Droplets, Heart, Beaker, Bone, Zap } from 'lucide-react';
import type { ExtendedLabResults as LabResultsType } from '@/hooks/usePatientAlerts';
import { cn } from '@/lib/utils';

interface ExtendedLabResultsProps {
  labResults: LabResultsType;
}

interface LabValue {
  key: string;
  label: string;
  value: number | undefined;
  unit: string;
  min: number;
  max: number;
}

interface LabCategory {
  name: string;
  icon: React.ReactNode;
  values: LabValue[];
}

const ExtendedLabResults = ({ labResults }: ExtendedLabResultsProps) => {
  const categories: LabCategory[] = [
    {
      name: 'Hématologie',
      icon: <Droplets className="h-4 w-4" />,
      values: [
        { key: 'hemoglobin_g_dl', label: 'Hémoglobine', value: labResults.hemoglobin_g_dl, unit: 'g/dL', min: 12, max: 17 },
        { key: 'platelets_k_ul', label: 'Plaquettes', value: labResults.platelets_k_ul, unit: 'k/µL', min: 150, max: 400 },
        { key: 'wbc_k_ul', label: 'Leucocytes', value: labResults.wbc_k_ul, unit: 'k/µL', min: 4, max: 10 },
      ]
    },
    {
      name: 'Fonction Rénale',
      icon: <Beaker className="h-4 w-4" />,
      values: [
        { key: 'creatinine_mg_dl', label: 'Créatinine', value: labResults.creatinine_mg_dl, unit: 'mg/dL', min: 0.6, max: 1.2 },
        { key: 'gfr_ml_min', label: 'DFG', value: labResults.gfr_ml_min, unit: 'mL/min', min: 90, max: 120 },
      ]
    },
    {
      name: 'Bilan Lipidique',
      icon: <Heart className="h-4 w-4" />,
      values: [
        { key: 'cholesterol_total_mg_dl', label: 'Cholestérol Total', value: labResults.cholesterol_total_mg_dl, unit: 'mg/dL', min: 0, max: 200 },
        { key: 'cholesterol_hdl_mg_dl', label: 'HDL', value: labResults.cholesterol_hdl_mg_dl, unit: 'mg/dL', min: 40, max: 100 },
        { key: 'cholesterol_ldl_mg_dl', label: 'LDL', value: labResults.cholesterol_ldl_mg_dl, unit: 'mg/dL', min: 0, max: 130 },
        { key: 'triglycerides_mg_dl', label: 'Triglycérides', value: labResults.triglycerides_mg_dl, unit: 'mg/dL', min: 0, max: 150 },
      ]
    },
    {
      name: 'Fonction Hépatique',
      icon: <TestTube className="h-4 w-4" />,
      values: [
        { key: 'alt_u_l', label: 'ALAT', value: labResults.alt_u_l, unit: 'U/L', min: 0, max: 40 },
        { key: 'ast_u_l', label: 'ASAT', value: labResults.ast_u_l, unit: 'U/L', min: 0, max: 40 },
        { key: 'bilirubin_mg_dl', label: 'Bilirubine', value: labResults.bilirubin_mg_dl, unit: 'mg/dL', min: 0, max: 1.2 },
      ]
    },
    {
      name: 'Électrolytes',
      icon: <Zap className="h-4 w-4" />,
      values: [
        { key: 'sodium_meq_l', label: 'Sodium', value: labResults.sodium_meq_l, unit: 'mEq/L', min: 135, max: 145 },
        { key: 'potassium_meq_l', label: 'Potassium', value: labResults.potassium_meq_l, unit: 'mEq/L', min: 3.5, max: 5 },
        { key: 'calcium_mg_dl', label: 'Calcium', value: labResults.calcium_mg_dl, unit: 'mg/dL', min: 8.5, max: 10.5 },
      ]
    },
    {
      name: 'Vitamines & Os',
      icon: <Bone className="h-4 w-4" />,
      values: [
        { key: 'vitamin_d_ng_ml', label: 'Vitamine D', value: labResults.vitamin_d_ng_ml, unit: 'ng/mL', min: 30, max: 100 },
        { key: 'bone_density_t_score_spine', label: 'T-Score Rachis', value: labResults.bone_density_t_score_spine, unit: '', min: -1, max: 1 },
      ]
    }
  ];

  const getValueStatus = (value: number | undefined, min: number, max: number): 'normal' | 'low' | 'high' | 'critical' => {
    if (value === undefined) return 'normal';
    
    // Check for critical values (significantly out of range)
    if (value < min * 0.5 || value > max * 2) return 'critical';
    if (value < min) return 'low';
    if (value > max) return 'high';
    return 'normal';
  };

  const getStatusBadge = (status: 'normal' | 'low' | 'high' | 'critical') => {
    switch (status) {
      case 'critical':
        return <Badge variant="destructive" className="text-[10px] px-1">Critique</Badge>;
      case 'low':
        return <Badge className="text-[10px] px-1 bg-blue-500/10 text-blue-500 border-blue-500/30">Bas</Badge>;
      case 'high':
        return <Badge className="text-[10px] px-1 bg-orange-500/10 text-orange-500 border-orange-500/30">Élevé</Badge>;
      default:
        return null;
    }
  };

  const getValueColor = (status: 'normal' | 'low' | 'high' | 'critical') => {
    switch (status) {
      case 'critical': return 'text-destructive font-bold';
      case 'low': return 'text-blue-500';
      case 'high': return 'text-orange-500';
      default: return 'text-foreground';
    }
  };

  // Filter categories to only show those with at least one value
  const populatedCategories = categories.filter(cat => 
    cat.values.some(v => v.value !== undefined && v.value !== 0)
  );

  if (populatedCategories.length === 0) {
    return null;
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <TestTube className="h-4 w-4 text-primary" />
          Résultats de Laboratoire
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {populatedCategories.map((category) => (
          <div key={category.name}>
            <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-2">
              {category.icon}
              {category.name}
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {category.values.map((val) => {
                if (val.value === undefined || val.value === 0) return null;
                
                const status = getValueStatus(val.value, val.min, val.max);
                
                return (
                  <div 
                    key={val.key}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-md border",
                      status === 'critical' ? 'border-destructive/50 bg-destructive/5' :
                      status !== 'normal' ? 'border-orange-500/30 bg-orange-500/5' :
                      'border-border/50 bg-muted/20'
                    )}
                  >
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground">{val.label}</span>
                      <div className="flex items-center gap-1">
                        <span className={cn("text-sm font-mono", getValueColor(status))}>
                          {val.value}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{val.unit}</span>
                      </div>
                    </div>
                    {getStatusBadge(status)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default ExtendedLabResults;
