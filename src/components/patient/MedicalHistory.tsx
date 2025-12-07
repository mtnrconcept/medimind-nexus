import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { History, Syringe, AlertTriangle, Calendar, Activity } from 'lucide-react';

interface PathologyHistory {
  id: string;
  name: string;
  date: string;
  age: string;
  status: 'resolved' | 'chronic' | 'active';
  icdCode?: string;
}

interface Vaccine {
  id: string;
  name: string;
  date: string;
  lot?: string;
  booster?: string;
}

interface Accident {
  id: string;
  type: string;
  date: string;
  description: string;
  severity: 'minor' | 'moderate' | 'severe';
  sequelae?: string;
}

interface MedicalHistoryProps {
  birthYear?: number;
  age?: number;
}

// Données de démonstration - en production, ces données viendraient de la base de données
const generateMockPathologies = (age: number): PathologyHistory[] => {
  const pathologies: PathologyHistory[] = [
    { id: '1', name: 'Varicelle', date: '2010', age: '5 ans', status: 'resolved', icdCode: 'B01' },
    { id: '2', name: 'Otite moyenne aiguë', date: '2012', age: '7 ans', status: 'resolved', icdCode: 'H66.9' },
    { id: '3', name: 'Appendicectomie', date: '2015', age: '10 ans', status: 'resolved', icdCode: 'K35' },
    { id: '4', name: 'Fracture radius gauche', date: '2018', age: '13 ans', status: 'resolved', icdCode: 'S52.5' },
    { id: '5', name: 'Asthme allergique', date: '2019', age: '14 ans', status: 'chronic', icdCode: 'J45.0' },
    { id: '6', name: 'Rhinite allergique', date: '2020', age: '15 ans', status: 'chronic', icdCode: 'J30.4' },
  ];
  
  if (age > 30) {
    pathologies.push(
      { id: '7', name: 'Hypertension artérielle', date: '2022', age: `${age - 3} ans`, status: 'active', icdCode: 'I10' },
      { id: '8', name: 'Hypercholestérolémie', date: '2023', age: `${age - 2} ans`, status: 'active', icdCode: 'E78.0' }
    );
  }
  
  return pathologies;
};

const mockVaccines: Vaccine[] = [
  { id: '1', name: 'BCG', date: 'Naissance', lot: 'BCG-2005-A1' },
  { id: '2', name: 'DTP (Diphtérie-Tétanos-Polio)', date: '2 mois', lot: 'DTP-2005-B2', booster: '11 ans' },
  { id: '3', name: 'Coqueluche', date: '2 mois', lot: 'COQ-2005-C3', booster: '11 ans' },
  { id: '4', name: 'Haemophilus influenzae b', date: '2 mois', lot: 'HIB-2005-D4' },
  { id: '5', name: 'Hépatite B', date: '2 mois', lot: 'HBV-2005-E5' },
  { id: '6', name: 'Pneumocoque', date: '2 mois', lot: 'PCV-2005-F6' },
  { id: '7', name: 'Méningocoque C', date: '5 mois', lot: 'MCV-2005-G7' },
  { id: '8', name: 'ROR (Rougeole-Oreillons-Rubéole)', date: '12 mois', lot: 'ROR-2006-H8', booster: '16 mois' },
  { id: '9', name: 'Grippe saisonnière', date: '2023', lot: 'FLU-2023-I9' },
  { id: '10', name: 'COVID-19 (Pfizer)', date: '2021', lot: 'COV-2021-J0', booster: '2022, 2023' },
  { id: '11', name: 'Papillomavirus (HPV)', date: '14 ans', lot: 'HPV-2019-K1' },
];

const mockAccidents: Accident[] = [
  { 
    id: '1', 
    type: 'Chute vélo', 
    date: '2016', 
    description: 'Chute à vélo avec plaie au genou nécessitant 4 points de suture',
    severity: 'minor'
  },
  { 
    id: '2', 
    type: 'Fracture', 
    date: '2018', 
    description: 'Fracture du radius gauche lors d\'une activité sportive (basketball)',
    severity: 'moderate',
    sequelae: 'Aucune séquelle après rééducation'
  },
  { 
    id: '3', 
    type: 'Accident domestique', 
    date: '2020', 
    description: 'Brûlure 2ème degré main droite (cuisine)',
    severity: 'moderate',
    sequelae: 'Légère cicatrice résiduelle'
  },
  { 
    id: '4', 
    type: 'Entorse', 
    date: '2022', 
    description: 'Entorse cheville droite grade II',
    severity: 'minor',
    sequelae: 'Légère instabilité résiduelle'
  },
];

const MedicalHistory = ({ birthYear, age = 30 }: MedicalHistoryProps) => {
  const pathologies = generateMockPathologies(age);

  const getStatusBadge = (status: PathologyHistory['status']) => {
    switch (status) {
      case 'resolved':
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 text-xs">Résolu</Badge>;
      case 'chronic':
        return <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/30 text-xs">Chronique</Badge>;
      case 'active':
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">Actif</Badge>;
    }
  };

  const getSeverityBadge = (severity: Accident['severity']) => {
    switch (severity) {
      case 'minor':
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 text-xs">Mineur</Badge>;
      case 'moderate':
        return <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/30 text-xs">Modéré</Badge>;
      case 'severe':
        return <Badge variant="destructive" className="text-xs">Grave</Badge>;
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          Historique Médical Complet
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="pathologies" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-8">
            <TabsTrigger value="pathologies" className="text-xs flex items-center gap-1">
              <Activity className="h-3 w-3" />
              Pathologies
            </TabsTrigger>
            <TabsTrigger value="vaccines" className="text-xs flex items-center gap-1">
              <Syringe className="h-3 w-3" />
              Vaccins
            </TabsTrigger>
            <TabsTrigger value="accidents" className="text-xs flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Accidents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pathologies" className="mt-3">
            <ScrollArea className="h-48">
              <div className="space-y-2">
                {pathologies.map((patho) => (
                  <div 
                    key={patho.id} 
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{patho.name}</span>
                        {patho.icdCode && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0 font-mono">
                            {patho.icdCode}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <Calendar className="h-3 w-3" />
                        <span>{patho.date}</span>
                        <span>•</span>
                        <span>{patho.age}</span>
                      </div>
                    </div>
                    {getStatusBadge(patho.status)}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
              <span>{pathologies.length} pathologies enregistrées</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" /> Résolu
                <span className="w-2 h-2 rounded-full bg-orange-500 ml-2" /> Chronique
                <span className="w-2 h-2 rounded-full bg-primary ml-2" /> Actif
              </span>
            </div>
          </TabsContent>

          <TabsContent value="vaccines" className="mt-3">
            <ScrollArea className="h-48">
              <div className="space-y-2">
                {mockVaccines.map((vaccine) => (
                  <div 
                    key={vaccine.id} 
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Syringe className="h-3 w-3 text-primary" />
                        <span className="font-medium text-sm">{vaccine.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <Calendar className="h-3 w-3" />
                        <span>{vaccine.date}</span>
                        {vaccine.lot && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-[10px]">Lot: {vaccine.lot}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {vaccine.booster && (
                      <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                        Rappel: {vaccine.booster}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
              <span>{mockVaccines.length} vaccins administrés • Calendrier vaccinal à jour</span>
            </div>
          </TabsContent>

          <TabsContent value="accidents" className="mt-3">
            <ScrollArea className="h-48">
              <div className="space-y-2">
                {mockAccidents.map((accident) => (
                  <div 
                    key={accident.id} 
                    className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`h-3 w-3 ${
                          accident.severity === 'severe' ? 'text-destructive' : 
                          accident.severity === 'moderate' ? 'text-orange-500' : 'text-yellow-500'
                        }`} />
                        <span className="font-medium text-sm">{accident.type}</span>
                      </div>
                      {getSeverityBadge(accident.severity)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{accident.description}</p>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{accident.date}</span>
                      </div>
                      {accident.sequelae && (
                        <span className="text-[10px] text-muted-foreground italic">
                          Séquelles: {accident.sequelae}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
              <span>{mockAccidents.length} incidents enregistrés</span>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default MedicalHistory;
