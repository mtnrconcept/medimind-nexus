/**
 * Timeline3DViewer - Interactive 3D Medical Timeline
 * 
 * Displays patient's medical history on a 3D timeline:
 * - Events positioned on temporal axis
 * - Color-coded by type (diagnosis, treatment, alert, etc.)
 * - Interactive navigation with zoom and scroll
 * - Integration with anatomical model overlay
 */

import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
    OrbitControls,
    Text,
    Billboard,
    Line,
    Html
} from '@react-three/drei';
import * as THREE from 'three';
import {
    Activity,
    Pill,
    AlertTriangle,
    Stethoscope,
    FileText,
    Calendar,
    ChevronLeft,
    ChevronRight,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    Play,
    Pause
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';
import { format, differenceInDays, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';

// ============================================
// TYPES
// ============================================

export interface TimelineEvent {
    id: string;
    date: Date;
    type: 'diagnosis' | 'treatment' | 'medication' | 'alert' | 'lab' | 'note' | 'surgery';
    title: string;
    description?: string;
    severity?: 'critical' | 'high' | 'moderate' | 'low';
    organ?: string;
    value?: number | string;
    unit?: string;
}

interface Timeline3DViewerProps {
    events: TimelineEvent[];
    startDate?: Date;
    endDate?: Date;
    onEventClick?: (event: TimelineEvent) => void;
    className?: string;
}

// ============================================
// CONSTANTS
// ============================================

const EVENT_COLORS: Record<TimelineEvent['type'], string> = {
    diagnosis: '#ef4444',   // Red
    treatment: '#3b82f6',   // Blue
    medication: '#22c55e',  // Green
    alert: '#f59e0b',       // Amber
    lab: '#8b5cf6',         // Purple
    note: '#6b7280',        // Gray
    surgery: '#ec4899',     // Pink
};

const SEVERITY_COLORS: Record<string, string> = {
    critical: '#dc2626',
    high: '#f97316',
    moderate: '#eab308',
    low: '#22c55e'
};

// ============================================
// 3D COMPONENTS
// ============================================

const TimelineAxis = ({
    startDate,
    endDate,
    length
}: {
    startDate: Date;
    endDate: Date;
    length: number;
}) => {
    // Validate dates first
    const isValidDate = (d: Date) => d instanceof Date && !isNaN(d.getTime());

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
        console.warn('TimelineAxis: Invalid dates provided', { startDate, endDate });
        return null;
    }

    const days = differenceInDays(endDate, startDate);
    if (days <= 0) return null;

    const tickCount = Math.min(days, 12);
    const tickInterval = length / tickCount;

    return (
        <group>
            {/* Main axis line */}
            <Line
                points={[[-length / 2, 0, 0], [length / 2, 0, 0]]}
                color="#4a5568"
                lineWidth={2}
            />

            {/* Tick marks and labels */}
            {Array.from({ length: tickCount + 1 }).map((_, i) => {
                const x = -length / 2 + (i * tickInterval);
                const date = addDays(startDate, Math.floor(i * (days / tickCount)));

                // Skip if date is invalid
                if (!isValidDate(date)) return null;

                return (
                    <group key={i} position={[x, 0, 0]}>
                        <Line
                            points={[[0, -0.2, 0], [0, 0.2, 0]]}
                            color="#4a5568"
                            lineWidth={1}
                        />
                        <Text
                            position={[0, -0.5, 0]}
                            fontSize={0.2}
                            color="#9ca3af"
                            anchorX="center"
                            anchorY="top"
                        >
                            {format(date, 'MMM yyyy', { locale: fr })}
                        </Text>
                    </group>
                );
            })}
        </group>
    );
};

const EventMarker = ({
    event,
    position,
    isSelected,
    onClick
}: {
    event: TimelineEvent;
    position: [number, number, number];
    isSelected: boolean;
    onClick: () => void;
}) => {
    const ref = useRef<THREE.Mesh>(null);
    const [hovered, setHovered] = useState(false);

    const color = EVENT_COLORS[event.type];
    const severityColor = event.severity ? SEVERITY_COLORS[event.severity] : color;

    useFrame(() => {
        if (ref.current) {
            // Pulse animation for hovered/selected
            const scale = isSelected ? 1.5 : hovered ? 1.3 : 1;
            ref.current.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.1);
        }
    });

    return (
        <group position={position}>
            {/* Event marker sphere */}
            <mesh
                ref={ref}
                onClick={onClick}
                onPointerOver={() => setHovered(true)}
                onPointerOut={() => setHovered(false)}
            >
                <sphereGeometry args={[0.15, 16, 16]} />
                <meshStandardMaterial
                    color={color}
                    emissive={hovered || isSelected ? color : '#000000'}
                    emissiveIntensity={hovered || isSelected ? 0.5 : 0}
                />
            </mesh>

            {/* Severity ring for alerts */}
            {event.severity && (
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.25, 0.03, 8, 24]} />
                    <meshStandardMaterial
                        color={severityColor}
                        transparent
                        opacity={0.7}
                    />
                </mesh>
            )}

            {/* Vertical line to axis */}
            <Line
                points={[[0, 0, 0], [0, -position[1], 0]]}
                color={color}
                lineWidth={1}
                dashed
                dashSize={0.1}
                gapSize={0.05}
            />

            {/* Info popup on hover */}
            {(hovered || isSelected) && (
                <Billboard position={[0, 0.5, 0]}>
                    <Html>
                        <div className="bg-popover/95 backdrop-blur-sm border rounded-lg p-2 shadow-lg min-w-[150px] max-w-[200px]">
                            <div className="flex items-center gap-2 mb-1">
                                <div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: color }}
                                />
                                <span className="text-xs font-medium truncate">{event.title}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                                {format(event.date, 'dd MMMM yyyy', { locale: fr })}
                            </p>
                            {event.description && (
                                <p className="text-[10px] mt-1 line-clamp-2">
                                    {event.description}
                                </p>
                            )}
                            {event.value && (
                                <p className="text-xs font-medium mt-1">
                                    {event.value} {event.unit || ''}
                                </p>
                            )}
                        </div>
                    </Html>
                </Billboard>
            )}
        </group>
    );
};

const Scene = ({
    events,
    startDate,
    endDate,
    selectedEventId,
    onEventClick
}: {
    events: TimelineEvent[];
    startDate: Date;
    endDate: Date;
    selectedEventId: string | null;
    onEventClick: (event: TimelineEvent) => void;
}) => {
    const timelineLength = 20;
    const days = differenceInDays(endDate, startDate);

    // Calculate event positions
    const eventPositions = useMemo(() => {
        return events.map(event => {
            const eventDays = differenceInDays(event.date, startDate);
            const x = -timelineLength / 2 + (eventDays / days) * timelineLength;
            const y = 1 + Math.random() * 0.5; // Slight variation in height
            const z = (Math.random() - 0.5) * 2; // Random depth
            return { event, position: [x, y, z] as [number, number, number] };
        });
    }, [events, startDate, days]);

    return (
        <>
            {/* Lighting */}
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1} />
            <pointLight position={[-10, -10, -10]} intensity={0.5} />

            {/* Timeline axis */}
            <TimelineAxis
                startDate={startDate}
                endDate={endDate}
                length={timelineLength}
            />

            {/* Event markers */}
            {eventPositions.map(({ event, position }) => (
                <EventMarker
                    key={event.id}
                    event={event}
                    position={position}
                    isSelected={selectedEventId === event.id}
                    onClick={() => onEventClick(event)}
                />
            ))}

            {/* Grid helper */}
            <gridHelper
                args={[timelineLength, 20, '#333', '#222']}
                rotation={[0, 0, 0]}
                position={[0, -0.5, 0]}
            />

            {/* Controls */}
            <OrbitControls
                enablePan={true}
                enableZoom={true}
                enableRotate={true}
                minDistance={5}
                maxDistance={30}
                maxPolarAngle={Math.PI / 2.2}
            />
        </>
    );
};

// ============================================
// MAIN COMPONENT
// ============================================

const Timeline3DViewer = ({
    events,
    startDate: propStartDate,
    endDate: propEndDate,
    onEventClick,
    className
}: Timeline3DViewerProps) => {
    const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [contextLost, setContextLost] = useState(false);

    // Calculate date range from events if not provided
    const dateRange = useMemo(() => {
        if (events.length === 0) {
            const now = new Date();
            return { start: addDays(now, -365), end: now };
        }

        const sortedDates = events.map(e => e.date.getTime()).sort((a, b) => a - b);
        const start = propStartDate || new Date(sortedDates[0]);
        const end = propEndDate || new Date(sortedDates[sortedDates.length - 1]);

        return { start, end };
    }, [events, propStartDate, propEndDate]);

    const handleEventClick = (event: TimelineEvent) => {
        setSelectedEvent(event);
        onEventClick?.(event);
    };

    // Event type legend
    const legend = useMemo(() => {
        const types = [...new Set(events.map(e => e.type))];
        return types.map(type => ({
            type,
            color: EVENT_COLORS[type],
            count: events.filter(e => e.type === type).length
        }));
    }, [events]);

    return (
        <Card className={cn("relative overflow-hidden", className)}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-primary" />
                        Timeline 3D
                    </CardTitle>
                    <div className="flex items-center gap-1">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7">
                                        <RotateCcw className="h-3 w-3" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Réinitialiser la vue</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-2 mt-2">
                    {legend.map(item => (
                        <Badge
                            key={item.type}
                            variant="outline"
                            className="text-[10px] gap-1"
                        >
                            <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: item.color }}
                            />
                            {item.type} ({item.count})
                        </Badge>
                    ))}
                </div>
            </CardHeader>

            <CardContent className="p-0">
                {/* 3D Canvas */}

            <div className="h-[400px] w-full bg-gradient-to-b from-slate-900 to-slate-800 relative">
                <Canvas
                    camera={{ position: [0, 5, 15], fov: 50 }}
                    dpr={[1, 2]}
                    onCreated={({ gl }) => {
                        gl.domElement.addEventListener('webglcontextlost', (e) => {
                            e.preventDefault();
                            setContextLost(true);
                        });
                        gl.domElement.addEventListener('webglcontextrestored', () => {
                            setContextLost(false);
                        });
                    }}
                >
                    <Scene
                        events={events}
                        startDate={dateRange.start}
                        endDate={dateRange.end}
                        selectedEventId={selectedEvent?.id || null}
                        onEventClick={handleEventClick}
                    />
                </Canvas>

                {contextLost && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
                        <div className="text-center p-4">
                            <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
                            <p className="text-sm font-medium">Contexte 3D perdu via WebGL</p>
                            <Button size="sm" variant="link" onClick={() => window.location.reload()} className="mt-2 text-destructive">
                                Recharger
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Selected event details */}
            {selectedEvent && (
                <div className="p-3 border-t bg-muted/30">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <div
                                    className="w-3 h-3 rounded-full shrink-0"
                                    style={{ backgroundColor: EVENT_COLORS[selectedEvent.type] }}
                                />
                                <span className="font-medium text-sm truncate">
                                    {selectedEvent.title}
                                </span>
                                {selectedEvent.severity && (
                                    <Badge
                                        variant="outline"
                                        className="text-[10px]"
                                        style={{
                                            borderColor: SEVERITY_COLORS[selectedEvent.severity],
                                            color: SEVERITY_COLORS[selectedEvent.severity]
                                        }}
                                    >
                                        {selectedEvent.severity}
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {format(selectedEvent.date, 'PPPP', { locale: fr })}
                            </p>
                            {selectedEvent.description && (
                                <p className="text-xs mt-1">{selectedEvent.description}</p>
                            )}
                        </div>
                        {selectedEvent.value && (
                            <div className="text-right shrink-0">
                                <span className="text-lg font-bold">{selectedEvent.value}</span>
                                {selectedEvent.unit && (
                                    <span className="text-xs text-muted-foreground ml-1">
                                        {selectedEvent.unit}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Date range indicator */}
            <div className="px-3 py-2 border-t text-xs text-muted-foreground flex items-center justify-between">
                <span>{format(dateRange.start, 'dd MMM yyyy', { locale: fr })}</span>
                <span className="text-primary font-medium">{events.length} événements</span>
                <span>{format(dateRange.end, 'dd MMM yyyy', { locale: fr })}</span>
            </div>
        </CardContent>
        </Card >
    );
};

export default Timeline3DViewer;
