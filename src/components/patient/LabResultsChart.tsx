import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertTriangle, CheckCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

interface LabResults {
  glucose_mg_dl: number;
  blood_pressure_sys: number;
  blood_pressure_dia: number;
  temperature_c: number;
}

interface LabResultsChartProps {
  labResults: LabResults;
}

const LabResultsChart = ({ labResults }: LabResultsChartProps) => {
  const getGlucoseStatus = (value: number) => {
    if (value < 70) return { status: 'low', color: 'hsl(var(--destructive))', label: 'Basse' };
    if (value > 120) return { status: 'high', color: 'hsl(var(--destructive))', label: 'Élevée' };
    return { status: 'normal', color: 'hsl(142.1, 76.2%, 36.3%)', label: 'Normal' };
  };

  const getBPStatus = (sys: number, dia: number) => {
    if (sys > 140 || dia > 90) return { status: 'high', color: 'hsl(var(--destructive))', label: 'Élevée' };
    if (sys < 90 || dia < 60) return { status: 'low', color: 'hsl(38, 92%, 50%)', label: 'Basse' };
    return { status: 'normal', color: 'hsl(142.1, 76.2%, 36.3%)', label: 'Normal' };
  };

  const getTempStatus = (value: number) => {
    if (value > 37.5) return { status: 'high', color: 'hsl(var(--destructive))', label: 'Fièvre' };
    if (value < 36) return { status: 'low', color: 'hsl(38, 92%, 50%)', label: 'Hypothermie' };
    return { status: 'normal', color: 'hsl(142.1, 76.2%, 36.3%)', label: 'Normal' };
  };

  const glucoseStatus = getGlucoseStatus(labResults.glucose_mg_dl);
  const bpStatus = getBPStatus(labResults.blood_pressure_sys, labResults.blood_pressure_dia);
  const tempStatus = getTempStatus(labResults.temperature_c);

  const glucoseData = [
    { name: 'Glycémie', value: labResults.glucose_mg_dl, max: 200 }
  ];

  const bpData = [
    { name: 'Systolique', value: labResults.blood_pressure_sys, max: 200 },
    { name: 'Diastolique', value: labResults.blood_pressure_dia, max: 120 }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Résultats Biologiques
        </CardTitle>
        <CardDescription>Valeurs biologiques avec alertes conditionnelles</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Glucose */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Glycémie</span>
            <div className="flex items-center gap-2">
              {glucoseStatus.status !== 'normal' ? (
                <AlertTriangle className="h-4 w-4" style={{ color: glucoseStatus.color }} />
              ) : (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              <span className="font-mono font-semibold" style={{ color: glucoseStatus.color }}>
                {labResults.glucose_mg_dl} mg/dL
              </span>
            </div>
          </div>
          <div className="h-8">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={glucoseData} layout="vertical">
                <XAxis type="number" domain={[0, 200]} hide />
                <YAxis type="category" dataKey="name" hide />
                <ReferenceLine x={70} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                <ReferenceLine x={120} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  <Cell fill={glucoseStatus.color} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0</span>
            <span>70-120 (Normal)</span>
            <span>200</span>
          </div>
        </div>

        {/* Blood Pressure */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Tension Artérielle</span>
            <div className="flex items-center gap-2">
              {bpStatus.status !== 'normal' ? (
                <AlertTriangle className="h-4 w-4" style={{ color: bpStatus.color }} />
              ) : (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              <span className="font-mono font-semibold" style={{ color: bpStatus.color }}>
                {labResults.blood_pressure_sys}/{labResults.blood_pressure_dia} mmHg
              </span>
            </div>
          </div>
          <div className="h-16">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bpData} layout="vertical" barGap={4}>
                <XAxis type="number" domain={[0, 200]} hide />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                <ReferenceLine x={140} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {bpData.map((_, index) => (
                    <Cell key={index} fill={bpStatus.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground">
            Normal: &lt;140/90 mmHg
          </p>
        </div>

        {/* Temperature */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Température</span>
            <div className="flex items-center gap-2">
              {tempStatus.status !== 'normal' ? (
                <AlertTriangle className="h-4 w-4" style={{ color: tempStatus.color }} />
              ) : (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              <span className="font-mono font-semibold" style={{ color: tempStatus.color }}>
                {labResults.temperature_c}°C
              </span>
            </div>
          </div>
          <div className="relative h-4 bg-gradient-to-r from-blue-400 via-green-400 to-red-400 rounded-full">
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-foreground rounded-full border-2 border-background shadow"
              style={{
                left: `${((labResults.temperature_c - 35) / 5) * 100}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>35°C</span>
            <span>36-37.5 (Normal)</span>
            <span>40°C</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LabResultsChart;
