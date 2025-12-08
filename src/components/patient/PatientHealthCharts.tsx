import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, ReferenceLine } from 'recharts';
import { TrendingUp, Activity, Weight, Ruler, Stethoscope } from 'lucide-react';

interface PatientHealthChartsProps {
    age: number;
    heightCm: number;
    weightKg: number;
    gender: string;
    medicalNotes?: string;
}

// Generate mock historical data based on current values
const generateHistoricalData = (currentWeight: number, currentHeight: number, age: number) => {
    const data = [];
    const monthsBack = 12;

    for (let i = monthsBack; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);

        // Simulate weight variation (±5kg around current)
        const weightVariation = (Math.random() - 0.5) * 10;
        const weight = currentWeight + weightVariation - (i * 0.3); // Slight upward trend

        // Height stays relatively stable for adults
        const height = currentHeight + (Math.random() - 0.5) * 0.5;

        // Calculate BMI
        const bmi = weight / ((height / 100) ** 2);

        // Simulate glucose readings
        const glucose = 55 + (Math.random() * 40) + (i * 2); // Shows improvement over time

        // Simulate blood pressure
        const systolic = 125 + (Math.random() * 20);
        const diastolic = 80 + (Math.random() * 10);

        data.push({
            date: date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
            weight: parseFloat(weight.toFixed(1)),
            height: parseFloat(height.toFixed(1)),
            bmi: parseFloat(bmi.toFixed(1)),
            glucose: parseFloat(glucose.toFixed(0)),
            systolic: parseFloat(systolic.toFixed(0)),
            diastolic: parseFloat(diastolic.toFixed(0)),
        });
    }

    return data;
};

// Generate illness periods data
const generateIllnessPeriods = (medicalNotes?: string) => {
    const illnesses = [];
    const currentDate = new Date();

    // Parse medical notes for illnesses
    const hasHypoglycemia = medicalNotes?.toLowerCase().includes('hypoglycémie');
    const hasCough = medicalNotes?.toLowerCase().includes('toux');
    const hasGout = medicalNotes?.toLowerCase().includes('goutte');

    if (hasHypoglycemia) {
        illnesses.push({
            name: 'Hypoglycémies',
            startDate: new Date(currentDate.getTime() - 90 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR'),
            endDate: currentDate.toLocaleDateString('fr-FR'),
            severity: 8,
            type: 'chronic',
            color: '#ef4444'
        });
    }

    if (hasCough) {
        illnesses.push({
            name: 'Toux sèche (IEC)',
            startDate: new Date(currentDate.getTime() - 60 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR'),
            endDate: currentDate.toLocaleDateString('fr-FR'),
            severity: 5,
            type: 'side-effect',
            color: '#f59e0b'
        });
    }

    if (hasGout) {
        illnesses.push({
            name: 'Crise de goutte',
            startDate: new Date(currentDate.getTime() - 120 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR'),
            endDate: new Date(currentDate.getTime() - 100 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR'),
            severity: 7,
            type: 'acute',
            color: '#8b5cf6'
        });
    }

    // Add some common minor illnesses
    illnesses.push(
        {
            name: 'Rhume',
            startDate: new Date(currentDate.getTime() - 45 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR'),
            endDate: new Date(currentDate.getTime() - 38 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR'),
            severity: 3,
            type: 'minor',
            color: '#06b6d4'
        },
        {
            name: 'Gastro-entérite',
            startDate: new Date(currentDate.getTime() - 150 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR'),
            endDate: new Date(currentDate.getTime() - 145 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR'),
            severity: 4,
            type: 'minor',
            color: '#10b981'
        }
    );

    return illnesses;
};

const PatientHealthCharts = ({ age, heightCm, weightKg, gender, medicalNotes }: PatientHealthChartsProps) => {
    const [activeTab, setActiveTab] = useState('bmi');

    const historicalData = generateHistoricalData(weightKg, heightCm, age);
    const illnessPeriods = generateIllnessPeriods(medicalNotes);

    // Current BMI
    const currentBMI = weightKg / ((heightCm / 100) ** 2);

    // BMI categories
    const getBMICategory = (bmi: number) => {
        if (bmi < 18.5) return { label: 'Insuffisance pondérale', color: '#3b82f6' };
        if (bmi < 25) return { label: 'Poids normal', color: '#10b981' };
        if (bmi < 30) return { label: 'Surpoids', color: '#f59e0b' };
        return { label: 'Obésité', color: '#ef4444' };
    };

    const bmiCategory = getBMICategory(currentBMI);

    return (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Évolution de la Santé
                </CardTitle>
            </CardHeader>
            <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-5 mb-4">
                        <TabsTrigger value="bmi" className="text-xs">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            IMC
                        </TabsTrigger>
                        <TabsTrigger value="weight" className="text-xs">
                            <Weight className="h-3 w-3 mr-1" />
                            Poids
                        </TabsTrigger>
                        <TabsTrigger value="vitals" className="text-xs">
                            <Activity className="h-3 w-3 mr-1" />
                            Constantes
                        </TabsTrigger>
                        <TabsTrigger value="glucose" className="text-xs">
                            <Stethoscope className="h-3 w-3 mr-1" />
                            Glycémie
                        </TabsTrigger>
                        <TabsTrigger value="illnesses" className="text-xs">
                            <Stethoscope className="h-3 w-3 mr-1" />
                            Maladies
                        </TabsTrigger>
                    </TabsList>

                    {/* BMI Evolution */}
                    <TabsContent value="bmi" className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <p className="text-xs text-muted-foreground">IMC Actuel</p>
                                <p className="text-2xl font-bold">{currentBMI.toFixed(1)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground">Catégorie</p>
                                <p className="text-sm font-semibold" style={{ color: bmiCategory.color }}>
                                    {bmiCategory.label}
                                </p>
                            </div>
                        </div>

                        <ResponsiveContainer width="100%" height={250}>
                            <AreaChart data={historicalData}>
                                <defs>
                                    <linearGradient id="colorBMI" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                                <XAxis
                                    dataKey="date"
                                    stroke="#9ca3af"
                                    style={{ fontSize: '10px' }}
                                />
                                <YAxis
                                    stroke="#9ca3af"
                                    style={{ fontSize: '10px' }}
                                    domain={[15, 35]}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1f2937',
                                        border: '1px solid #374151',
                                        borderRadius: '8px',
                                        fontSize: '12px'
                                    }}
                                />
                                <ReferenceLine y={18.5} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: 'Sous-poids', fontSize: 10 }} />
                                <ReferenceLine y={25} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Normal', fontSize: 10 }} />
                                <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Surpoids', fontSize: 10 }} />
                                <Area
                                    type="monotone"
                                    dataKey="bmi"
                                    stroke="#8b5cf6"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorBMI)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </TabsContent>

                    {/* Weight Evolution */}
                    <TabsContent value="weight" className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <p className="text-xs text-muted-foreground">Poids Actuel</p>
                                <p className="text-2xl font-bold">{weightKg} kg</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground">Taille</p>
                                <p className="text-sm font-semibold">{heightCm} cm</p>
                            </div>
                        </div>

                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={historicalData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                                <XAxis
                                    dataKey="date"
                                    stroke="#9ca3af"
                                    style={{ fontSize: '10px' }}
                                />
                                <YAxis
                                    stroke="#9ca3af"
                                    style={{ fontSize: '10px' }}
                                    domain={['dataMin - 5', 'dataMax + 5']}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1f2937',
                                        border: '1px solid #374151',
                                        borderRadius: '8px',
                                        fontSize: '12px'
                                    }}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                                <Line
                                    type="monotone"
                                    dataKey="weight"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    dot={{ fill: '#10b981', r: 3 }}
                                    name="Poids (kg)"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </TabsContent>

                    {/* Vital Signs */}
                    <TabsContent value="vitals" className="space-y-4">
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={historicalData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                                <XAxis
                                    dataKey="date"
                                    stroke="#9ca3af"
                                    style={{ fontSize: '10px' }}
                                />
                                <YAxis
                                    stroke="#9ca3af"
                                    style={{ fontSize: '10px' }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1f2937',
                                        border: '1px solid #374151',
                                        borderRadius: '8px',
                                        fontSize: '12px'
                                    }}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                                <ReferenceLine y={140} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'HTA', fontSize: 10 }} />
                                <Line
                                    type="monotone"
                                    dataKey="systolic"
                                    stroke="#ef4444"
                                    strokeWidth={2}
                                    dot={{ fill: '#ef4444', r: 3 }}
                                    name="Systolique (mmHg)"
                                />
                                <Line
                                    type="monotone"
                                    dataKey="diastolic"
                                    stroke="#f59e0b"
                                    strokeWidth={2}
                                    dot={{ fill: '#f59e0b', r: 3 }}
                                    name="Diastolique (mmHg)"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </TabsContent>

                    {/* Glucose Evolution */}
                    <TabsContent value="glucose" className="space-y-4">
                        <ResponsiveContainer width="100%" height={250}>
                            <AreaChart data={historicalData}>
                                <defs>
                                    <linearGradient id="colorGlucose" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                                <XAxis
                                    dataKey="date"
                                    stroke="#9ca3af"
                                    style={{ fontSize: '10px' }}
                                />
                                <YAxis
                                    stroke="#9ca3af"
                                    style={{ fontSize: '10px' }}
                                    domain={[40, 200]}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1f2937',
                                        border: '1px solid #374151',
                                        borderRadius: '8px',
                                        fontSize: '12px'
                                    }}
                                />
                                <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Hypoglycémie', fontSize: 10 }} />
                                <ReferenceLine y={120} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Normal', fontSize: 10 }} />
                                <ReferenceLine y={180} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Hyperglycémie', fontSize: 10 }} />
                                <Area
                                    type="monotone"
                                    dataKey="glucose"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorGlucose)"
                                    name="Glycémie (mg/dL)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </TabsContent>

                    {/* Illness Periods */}
                    <TabsContent value="illnesses" className="space-y-4">
                        <div className="space-y-3">
                            <p className="text-xs text-muted-foreground mb-3">
                                Historique des périodes de maladie (12 derniers mois)
                            </p>

                            {illnessPeriods.map((illness, idx) => (
                                <div key={idx} className="relative">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: illness.color }}
                                            />
                                            <span className="text-sm font-medium">{illness.name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                ({illness.type === 'chronic' ? 'Chronique' :
                                                    illness.type === 'acute' ? 'Aiguë' :
                                                        illness.type === 'side-effect' ? 'Effet secondaire' : 'Mineure'})
                                            </span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            Sévérité: {illness.severity}/10
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                        <span>{illness.startDate}</span>
                                        <span>→</span>
                                        <span>{illness.endDate}</span>
                                    </div>

                                    {/* Visual timeline bar */}
                                    <div className="w-full h-8 bg-muted/30 rounded-md overflow-hidden relative">
                                        <div
                                            className="h-full rounded-md opacity-60"
                                            style={{
                                                backgroundColor: illness.color,
                                                width: `${illness.severity * 10}%`
                                            }}
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-xs font-medium text-white drop-shadow-lg">
                                                {illness.severity}/10
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {illnessPeriods.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                    Aucune période de maladie enregistrée
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
};

export default PatientHealthCharts;
