/**
 * HealthTimelineChart - Multi-parameter Health Evolution Chart
 * 
 * Displays patient health metrics over time:
 * - Multiple parameters on synchronized axes
 * - Event markers for significant occurrences
 * - Trend analysis indicators
 * - Reference ranges visualization
 */

import { useMemo, useState } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    ReferenceArea,
    Legend,
    Brush,
    ComposedChart,
    Bar,
    Area
} from 'recharts';
import {
    Activity,
    TrendingUp,
    TrendingDown,
    Minus,
    Eye,
    EyeOff,
    Calendar,
    AlertTriangle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

// ============================================
// TYPES
// ============================================

export interface HealthDataPoint {
    date: Date;
    [key: string]: Date | number | undefined;
}

export interface ParameterConfig {
    key: string;
    label: string;
    unit: string;
    color: string;
    normalMin?: number;
    normalMax?: number;
    criticalMin?: number;
    criticalMax?: number;
    yAxisId?: 'left' | 'right';
}

export interface TimelineEventMarker {
    date: Date;
    type: string;
    label: string;
    color?: string;
}

interface HealthTimelineChartProps {
    data: HealthDataPoint[];
    parameters: ParameterConfig[];
    events?: TimelineEventMarker[];
    title?: string;
    className?: string;
    onDataPointClick?: (dataPoint: HealthDataPoint) => void;
}

// ============================================
// PREDEFINED PARAMETER CONFIGURATIONS
// ============================================

export const COMMON_PARAMETERS: Record<string, ParameterConfig> = {
    glucose: {
        key: 'glucose_mg_dl',
        label: 'Glycémie',
        unit: 'mg/dL',
        color: '#3b82f6',
        normalMin: 70,
        normalMax: 100,
        criticalMin: 50,
        criticalMax: 180,
    },
    systolic: {
        key: 'blood_pressure_sys',
        label: 'TA Systolique',
        unit: 'mmHg',
        color: '#ef4444',
        normalMin: 90,
        normalMax: 120,
        criticalMax: 180,
    },
    diastolic: {
        key: 'blood_pressure_dia',
        label: 'TA Diastolique',
        unit: 'mmHg',
        color: '#f97316',
        normalMin: 60,
        normalMax: 80,
        criticalMax: 110,
    },
    temperature: {
        key: 'temperature_c',
        label: 'Température',
        unit: '°C',
        color: '#22c55e',
        normalMin: 36.1,
        normalMax: 37.2,
        criticalMax: 39.0,
        yAxisId: 'right',
    },
    hemoglobin: {
        key: 'hemoglobin_g_dl',
        label: 'Hémoglobine',
        unit: 'g/dL',
        color: '#8b5cf6',
        normalMin: 12,
        normalMax: 17,
        criticalMin: 8,
    },
    creatinine: {
        key: 'creatinine_mg_dl',
        label: 'Créatinine',
        unit: 'mg/dL',
        color: '#06b6d4',
        normalMin: 0.6,
        normalMax: 1.2,
        criticalMax: 2.0,
    },
    potassium: {
        key: 'potassium_meq_l',
        label: 'Potassium',
        unit: 'mEq/L',
        color: '#eab308',
        normalMin: 3.5,
        normalMax: 5.0,
        criticalMin: 3.0,
        criticalMax: 6.0,
    },
    spo2: {
        key: 'spo2_percent',
        label: 'SpO2',
        unit: '%',
        color: '#ec4899',
        normalMin: 95,
        normalMax: 100,
        criticalMin: 90,
        yAxisId: 'right',
    },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

const calculateTrend = (values: (number | undefined)[]): 'up' | 'down' | 'stable' => {
    const validValues = values.filter((v): v is number => v !== undefined);
    if (validValues.length < 2) return 'stable';

    const recent = validValues.slice(-3);
    const older = validValues.slice(-6, -3);

    if (older.length === 0) return 'stable';

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const change = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? 'up' : 'down';
};

const CustomTooltip = ({
    active,
    payload,
    label,
    parameters
}: {
    active?: boolean;
    payload?: any[];
    label?: string;
    parameters: ParameterConfig[];
}) => {
    if (!active || !payload || !payload.length) return null;

    const date = new Date(label || '');
    const isValidDate = !isNaN(date.getTime());

    return (
        <div className="bg-popover border rounded-lg shadow-lg p-3 min-w-[180px]">
            <p className="text-xs font-medium text-muted-foreground mb-2">
                {isValidDate ? format(date, 'dd MMMM yyyy', { locale: fr }) : label}
            </p>
            <div className="space-y-1.5">
                {payload.map((entry: any, index: number) => {
                    const param = parameters.find(p => p.key === entry.dataKey);
                    if (!param || entry.value === undefined) return null;

                    const isNormal = (!param.normalMin || entry.value >= param.normalMin) &&
                        (!param.normalMax || entry.value <= param.normalMax);
                    const isCritical = (param.criticalMin && entry.value < param.criticalMin) ||
                        (param.criticalMax && entry.value > param.criticalMax);

                    return (
                        <div key={index} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: entry.color }}
                                />
                                <span className="text-xs">{param.label}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className={cn(
                                    "text-xs font-medium",
                                    isCritical && "text-red-500",
                                    !isNormal && !isCritical && "text-yellow-500"
                                )}>
                                    {entry.value.toFixed(1)}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                    {param.unit}
                                </span>
                                {isCritical && <AlertTriangle className="h-3 w-3 text-red-500" />}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ============================================
// MAIN COMPONENT
// ============================================

const HealthTimelineChart = ({
    data,
    parameters,
    events,
    title = 'Évolution des Paramètres',
    className,
    onDataPointClick
}: HealthTimelineChartProps) => {
    const [visibleParams, setVisibleParams] = useState<Set<string>>(
        new Set(parameters.map(p => p.key))
    );
    const [showReferenceRanges, setShowReferenceRanges] = useState(true);

    // Format data for chart
    const chartData = useMemo(() => {
        return data.map(point => ({
            ...point,
            dateStr: format(point.date, 'dd/MM/yyyy'),
            timestamp: point.date.getTime(),
        })).sort((a, b) => a.timestamp - b.timestamp);
    }, [data]);

    // Calculate trends for each parameter
    const trends = useMemo(() => {
        return parameters.reduce((acc, param) => {
            const values = data.map(d => d[param.key] as number | undefined);
            acc[param.key] = calculateTrend(values);
            return acc;
        }, {} as Record<string, 'up' | 'down' | 'stable'>);
    }, [data, parameters]);

    // Toggle parameter visibility
    const toggleParameter = (key: string) => {
        setVisibleParams(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    // Get Y-axis domains
    const leftParams = parameters.filter(p => p.yAxisId !== 'right');
    const rightParams = parameters.filter(p => p.yAxisId === 'right');

    return (
        <Card className={cn("", className)}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        {title}
                    </CardTitle>

                    {/* Parameter visibility controls */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 text-xs">
                                <Eye className="h-3 w-3 mr-1" />
                                Paramètres ({visibleParams.size})
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64" align="end">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between pb-2 border-b">
                                    <span className="text-sm font-medium">Afficher</span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs"
                                        onClick={() => setVisibleParams(new Set(parameters.map(p => p.key)))}
                                    >
                                        Tout afficher
                                    </Button>
                                </div>
                                {parameters.map(param => (
                                    <label
                                        key={param.key}
                                        className="flex items-center gap-2 cursor-pointer"
                                    >
                                        <Checkbox
                                            checked={visibleParams.has(param.key)}
                                            onCheckedChange={() => toggleParameter(param.key)}
                                        />
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: param.color }}
                                        />
                                        <span className="text-sm flex-1">{param.label}</span>
                                        <span className="text-xs text-muted-foreground">{param.unit}</span>
                                    </label>
                                ))}
                                <div className="border-t pt-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <Checkbox
                                            checked={showReferenceRanges}
                                            onCheckedChange={(checked) => setShowReferenceRanges(!!checked)}
                                        />
                                        <span className="text-sm">Afficher plages de référence</span>
                                    </label>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Trend indicators */}
                <div className="flex flex-wrap gap-2 mt-2">
                    {parameters.filter(p => visibleParams.has(p.key)).map(param => {
                        const trend = trends[param.key];

                        return (
                            <Badge
                                key={param.key}
                                variant="outline"
                                className="text-[10px] gap-1"
                                style={{ borderColor: param.color }}
                            >
                                <div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: param.color }}
                                />
                                {param.label}
                                {trend === 'up' && <TrendingUp className="h-3 w-3 text-red-500" />}
                                {trend === 'down' && <TrendingDown className="h-3 w-3 text-green-500" />}
                                {trend === 'stable' && <Minus className="h-3 w-3 text-muted-foreground" />}
                            </Badge>
                        );
                    })}
                </div>
            </CardHeader>

            <CardContent className="pt-4">
                <ResponsiveContainer width="100%" height={350}>
                    <ComposedChart
                        data={chartData}
                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                        onClick={(data) => {
                            if (data?.activePayload?.[0]?.payload) {
                                onDataPointClick?.(data.activePayload[0].payload);
                            }
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />

                        <XAxis
                            dataKey="dateStr"
                            tick={{ fontSize: 10, fill: '#888' }}
                            tickLine={{ stroke: '#444' }}
                            axisLine={{ stroke: '#444' }}
                        />

                        {/* Left Y-axis */}
                        {leftParams.length > 0 && (
                            <YAxis
                                yAxisId="left"
                                orientation="left"
                                tick={{ fontSize: 10, fill: '#888' }}
                                tickLine={{ stroke: '#444' }}
                                axisLine={{ stroke: '#444' }}
                            />
                        )}

                        {/* Right Y-axis */}
                        {rightParams.length > 0 && (
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                tick={{ fontSize: 10, fill: '#888' }}
                                tickLine={{ stroke: '#444' }}
                                axisLine={{ stroke: '#444' }}
                            />
                        )}

                        <Tooltip
                            content={<CustomTooltip parameters={parameters} />}
                            cursor={{ stroke: '#666', strokeDasharray: '5 5' }}
                        />

                        {/* Reference ranges */}
                        {showReferenceRanges && parameters.map(param => {
                            if (!visibleParams.has(param.key)) return null;

                            const yAxisId = param.yAxisId || 'left';

                            return (
                                <ReferenceArea
                                    key={`range-${param.key}`}
                                    yAxisId={yAxisId}
                                    y1={param.normalMin}
                                    y2={param.normalMax}
                                    fill={param.color}
                                    fillOpacity={0.05}
                                    stroke={param.color}
                                    strokeOpacity={0.2}
                                    strokeDasharray="3 3"
                                />
                            );
                        })}

                        {/* Data lines */}
                        {parameters.map(param => {
                            if (!visibleParams.has(param.key)) return null;

                            return (
                                <Line
                                    key={param.key}
                                    yAxisId={param.yAxisId || 'left'}
                                    type="monotone"
                                    dataKey={param.key}
                                    stroke={param.color}
                                    strokeWidth={2}
                                    dot={{ r: 4, fill: param.color }}
                                    activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                                    connectNulls
                                />
                            );
                        })}

                        {/* Event markers */}
                        {events?.map((event, idx) => (
                            <ReferenceLine
                                key={`event-${idx}`}
                                x={format(event.date, 'dd/MM/yyyy')}
                                stroke={event.color || '#888'}
                                strokeDasharray="5 5"
                                label={{
                                    value: event.label,
                                    position: 'top',
                                    fontSize: 10,
                                    fill: event.color || '#888'
                                }}
                            />
                        ))}

                        {/* Brush for zooming */}
                        <Brush
                            dataKey="dateStr"
                            height={30}
                            stroke="#666"
                            fill="#1a1a1a"
                            tickFormatter={(val) => val}
                        />

                        <Legend
                            verticalAlign="bottom"
                            height={36}
                            formatter={(value) => {
                                const param = parameters.find(p => p.key === value);
                                return param ? `${param.label} (${param.unit})` : value;
                            }}
                        />
                    </ComposedChart>
                </ResponsiveContainer>

                {/* Summary stats */}
                <div className="mt-4 pt-4 border-t">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {parameters.filter(p => visibleParams.has(p.key)).slice(0, 4).map(param => {
                            const values = data
                                .map(d => d[param.key])
                                .filter((v): v is number => typeof v === 'number');

                            if (values.length === 0) return null;

                            const latest = values[values.length - 1];
                            const min = Math.min(...values);
                            const max = Math.max(...values);
                            const avg = values.reduce((a, b) => a + b, 0) / values.length;

                            return (
                                <div key={param.key} className="p-2 rounded-lg bg-muted/30">
                                    <div className="flex items-center gap-1 mb-1">
                                        <div
                                            className="w-2 h-2 rounded-full"
                                            style={{ backgroundColor: param.color }}
                                        />
                                        <span className="text-xs font-medium">{param.label}</span>
                                    </div>
                                    <div className="text-lg font-bold">{latest.toFixed(1)}</div>
                                    <div className="text-[10px] text-muted-foreground">
                                        Min: {min.toFixed(1)} | Max: {max.toFixed(1)} | Moy: {avg.toFixed(1)} {param.unit}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default HealthTimelineChart;
